import type { PrismaClient } from '../generated/prisma/client'
import type { ChatSettings } from '../chat/settings'
import type { PrivateObjectStore } from '../storage/object-store'
import { WorkspaceError } from '../services/workspace-error'
import {
  identityRoot,
  identityMembers,
  lockIdentity,
  identityTransaction,
} from './formula-identities'
import { reserveUsage } from './usage'
import { repairOutputSchema, type RepairView } from '../../shared/schemas/formula-intelligence'
import { repairSystem } from '../formula-intelligence/prompts'
import { intelligenceRequest } from '../formula-intelligence/provider'
import { normalizeLatex } from '../documents/formula-renderer'
import katex from 'katex'
const view = (row: {
  id: string
  status: string
  originalLatex: string
  candidateLatex: string | null
  domain: string
  reason: string | null
  expiresAt: Date
}): RepairView => ({
  id: row.id,
  status: row.status,
  originalLatex: row.originalLatex,
  candidateLatex: row.candidateLatex,
  domain: row.domain,
  reason: row.reason,
  expiresAt: row.expiresAt.toISOString(),
})
export async function proposeFormulaRepair(
  db: PrismaClient,
  store: PrivateObjectStore,
  settings: ChatSettings,
  quota: number,
  ownerId: string,
  id: string,
  input: { requestKey: string; expectedVersionId: string; domain: string },
): Promise<RepairView> {
  await identityRoot(db, ownerId, id)
  const prepared = await db.$transaction(async (tx) => {
    await lockIdentity(tx, ownerId)
    const old = await tx.formulaRepair.findUnique({
      where: { ownerId_requestKey: { ownerId, requestKey: input.requestKey } },
    })
    if (old) {
      if (
        old.formulaId !== id ||
        old.expectedVersionId !== input.expectedVersionId ||
        old.domain !== input.domain
      )
        throw new WorkspaceError(409, '请求编号已用于其他内容。')
      if (['PROCESSING', 'CANDIDATE'].includes(old.status) && old.expiresAt < new Date())
        return {
          row: await tx.formulaRepair.update({
            where: { id: old.id },
            data: { status: 'FAILED', reason: '上次请求未确认或候选已过期，请重新生成。' },
          }),
        }
      return { row: old }
    }
    const formula = await tx.formula.findFirst({
      where: { id, ownerId, deletedAt: null },
      include: {
        versions: { orderBy: { number: 'desc' }, take: 1 },
        recognitionTask: { include: { inputFile: true } },
      },
    })
    const version = formula?.versions[0],
      file = formula?.recognitionTask?.inputFile
    if (!version || version.id !== input.expectedVersionId)
      throw new WorkspaceError(409, '公式已变更，请刷新后重新生成。')
    if (!file || file.status !== 'READY' || file.bucket !== store.bucket || version.isMock)
      throw new WorkspaceError(422, '该记录没有可用原始图片，请上传图片后使用。')
    if (
      await tx.formulaRepair.count({
        where: { ownerId, status: 'PROCESSING', expiresAt: { gt: new Date() } },
      })
    )
      throw new WorkspaceError(429, '已有纠错正在处理，请稍后重试。')
    if (settings.provider !== 'deepseek' || !settings.apiKey)
      throw new WorkspaceError(503, 'AI服务尚未配置，已保留原公式。')
    await reserveUsage(tx, ownerId, 'CHAT', quota)
    const row = await tx.formulaRepair.create({
      data: {
        ownerId,
        formulaId: id,
        expectedVersionId: version.id,
        requestKey: input.requestKey,
        originalLatex: version.latex,
        domain: input.domain,
        status: 'PROCESSING',
        expiresAt: new Date(Date.now() + 90000),
      },
    })
    return { row, file }
  })
  if (!prepared.file) return view(prepared.row)
  try {
    const bytes = await store.get(prepared.file.objectKey)
    if (bytes.length > 10 * 1024 * 1024) throw Error('Image too large')
    const answer = repairOutputSchema.parse(
      await intelligenceRequest(
        settings,
        repairSystem,
        { recognizedLatex: prepared.row.originalLatex, domain: input.domain },
        { bytes, mimeType: prepared.file.mimeType },
      ),
    )
    let latex: string | null = null,
      status: string = answer.status
    if (status === 'candidate') {
      latex = normalizeLatex(answer.latex)
      katex.renderToString(latex, { throwOnError: true, trust: false, strict: 'error' })
      if (latex === prepared.row.originalLatex) {
        latex = null
        status = 'unchanged'
      }
    }
    return view(
      await db.formulaRepair.update({
        where: { id: prepared.row.id },
        data: {
          status: status === 'candidate' ? 'CANDIDATE' : status.toUpperCase(),
          candidateLatex: latex,
          reason: answer.reason,
          expiresAt: new Date(Date.now() + 15 * 60000),
        },
      }),
    )
  } catch (error) {
    const reason =
      error instanceof WorkspaceError ? error.message : 'AI纠错暂未完成，已保留原识别结果。'
    return view(
      await db.formulaRepair.update({
        where: { id: prepared.row.id },
        data: { status: 'FAILED', reason },
      }),
    )
  }
}
export async function confirmFormulaRepair(
  db: PrismaClient,
  ownerId: string,
  id: string,
  proposalId: string,
) {
  await identityRoot(db, ownerId, id)
  return identityTransaction(db, async (tx) => {
    await lockIdentity(tx, ownerId)
    const proposal = await tx.formulaRepair.findFirst({
      where: { id: proposalId, formulaId: id, ownerId },
    })
    if (!proposal) throw new WorkspaceError(404, '未找到纠错候选。')
    if (proposal.status === 'CONFIRMED') return
    if (
      proposal.status !== 'CANDIDATE' ||
      !proposal.candidateLatex ||
      proposal.expiresAt < new Date()
    )
      throw new WorkspaceError(409, '候选已过期，请重新生成。')
    const latest = await tx.formulaVersion.findFirst({
      where: { ownerId, formulaId: id },
      orderBy: { number: 'desc' },
    })
    if (latest?.id !== proposal.expectedVersionId)
      throw new WorkspaceError(409, '公式已变更，不能使用旧候选。')
    const source = await tx.formula.findUniqueOrThrow({ where: { id } })
    if (!source.canonicalId) {
      const members = await identityMembers(tx, ownerId, id)
      await tx.formula.updateMany({
        where: { ownerId, id: { in: members.map((x) => x.id) } },
        data: { canonicalId: null, duplicateDecision: null, duplicateCheck: { status: 'none' } },
      })
    }
    await tx.formulaVersion.create({
      data: {
        ownerId,
        formulaId: id,
        number: latest.number + 1,
        latex: proposal.candidateLatex,
        origin: 'MANUAL',
        modelVersion: 'ai-repair',
        isMock: false,
      },
    })
    await tx.formula.update({
      where: { id },
      data: {
        canonicalId: null,
        duplicateDecision: null,
        duplicateCheck: { status: 'none' },
        updatedAt: new Date(),
      },
    })
    await tx.formulaRepair.update({ where: { id: proposal.id }, data: { status: 'CONFIRMED' } })
  })
}
