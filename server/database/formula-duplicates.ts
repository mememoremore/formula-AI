import { randomUUID, createHash } from 'node:crypto'
import type { PrismaClient, Prisma } from '../generated/prisma/client'
import type { ChatSettings } from '../chat/settings'
import { sameTemplate } from '../formula-intelligence/template.cjs'
import { exactFormulaKey } from '../formula-intelligence/keys'
import { equivalenceSystem } from '../formula-intelligence/prompts'
import { intelligenceRequest } from '../formula-intelligence/provider'
import { aiVerdictSchema, type DuplicateView } from '../../shared/schemas/formula-intelligence'
import { WorkspaceError } from '../services/workspace-error'
import {
  identityRoot,
  identityMembers,
  lockIdentity,
  identityTransaction,
} from './formula-identities'
import { reserveUsage } from './usage'

const latestInclude = {
  versions: { orderBy: { number: 'desc' as const }, take: 1 },
  category: { select: { name: true } },
}
function features(latex: string) {
  return {
    fns: new Set(
      [
        ...latex.matchAll(
          /\\(sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|ln|log|exp|sqrt|int|sum|prod|lim)\b/g,
        ),
      ].map((m) => m[1]),
    ),
    nums: new Set(latex.match(/\d+/g) ?? []),
    power: latex.includes('^'),
    differential: /\\(?:Delta|nabla|partial)\b/.test(latex),
  }
}
export function rankSimilarity<T extends { latex: string }>(latex: string, items: T[]): T[] {
  const a = features(latex)
  if (latex.length > 2000) return []
  return items
    .map((item) => {
      const b = features(item.latex),
        f = [...a.fns].filter((x) => b.fns.has(x)).length,
        n = [...a.nums].filter((x) => b.nums.has(x)).length
      return {
        item,
        score:
          !a.differential &&
          !b.differential &&
          (f > 0 || (!a.fns.size && !b.fns.size && a.power && b.power && n > 0)) &&
          item.latex.length <= 1500
            ? f * 10 + n + (a.power === b.power ? 1 : 0)
            : 0,
      }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.item)
}
export async function checkDuplicate(
  db: PrismaClient,
  ownerId: string,
  id: string,
  settings: ChatSettings,
  quota: number,
): Promise<DuplicateView> {
  await identityRoot(db, ownerId, id)
  const source = await db.formula.findFirstOrThrow({
      where: { id, ownerId, deletedAt: null },
      include: latestInclude,
    }),
    v = source.versions[0]!
  const old = source.duplicateCheck as
    (DuplicateView & { until?: number; fingerprint?: string }) | null
  if (source.duplicateDecision)
    return {
      ...(old ?? { versionId: v.id }),
      status: source.duplicateDecision === 'agree' ? 'agree' : 'ignore',
    }
  if (
    !(await db.formulaVersion.findFirst({
      where: {
        formulaId: id,
        ownerId,
        number: 1,
        isMock: false,
        origin: { in: ['RECOGNITION', 'MANUAL'] },
      },
      select: { id: true },
    }))
  )
    return { status: 'none', versionId: v.id }
  if (source.categoryId && v.number === 1) return { status: 'none', versionId: v.id }
  const earlier = await db.formula.findMany({
    where: {
      ownerId,
      deletedAt: null,
      OR: [
        { createdAt: { lt: source.createdAt } },
        { createdAt: source.createdAt, id: { lt: id } },
      ],
      versions: { some: { number: 1, isMock: false, origin: { in: ['RECOGNITION', 'MANUAL'] } } },
    },
    include: latestInclude,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 2000,
  })
  const items = earlier.flatMap((f) =>
    f.versions[0]
      ? [
          {
            id: f.id,
            versionId: f.versions[0].id,
            latex: f.versions[0].latex,
            title: f.title,
            category: f.category?.name ?? '未分类',
          },
        ]
      : [],
  )
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([v.id, items.map((x) => x.versionId)]))
    .digest('hex')
  if (
    old?.fingerprint === fingerprint &&
    ((old.status !== 'checking' && old.status !== 'unavailable') || (old.until ?? 0) > Date.now())
  )
    return old
  const exactKey = exactFormulaKey(v.latex)
  const chosen =
    items.find((x) => exactFormulaKey(x.latex) === exactKey) ??
    items.find((x) => sameTemplate(x.latex, v.latex))
  const token = randomUUID()
  const claimed = await db.$transaction(async (tx) => {
    await lockIdentity(tx, ownerId)
    const current = await tx.formula.findUniqueOrThrow({ where: { id }, include: latestInclude })
    if (current.versions[0]?.id !== v.id || current.duplicateDecision) return false
    const check = current.duplicateCheck as { status?: string; until?: number } | null
    if (check?.status === 'checking' && (check.until ?? 0) > Date.now()) return false
    await tx.formula.update({
      where: { id },
      data: {
        duplicateCheck: {
          status: 'checking',
          versionId: v.id,
          fingerprint,
          token,
          until: Date.now() + 90000,
        },
      },
    })
    return true
  })
  if (!claimed) return { status: 'checking', versionId: v.id }
  let result: DuplicateView = { status: 'none', versionId: v.id }
  if (chosen)
    result = {
      status: 'pending',
      versionId: v.id,
      match: chosen,
      reason: '此前实际识别过的相同公式或一致变量替换。',
    }
  else {
    const candidates = rankSimilarity(v.latex, items)
    if (candidates.length) {
      try {
        if (settings.provider !== 'deepseek' || !settings.apiKey)
          throw new WorkspaceError(503, 'AI尚未配置。')
        await db.$transaction((tx) => reserveUsage(tx, ownerId, 'CHAT', quota))
        const raw = await intelligenceRequest(
          settings,
          equivalenceSystem,
          { current: { latex: v.latex }, candidates },
          undefined,
          12000,
        )
        const verdict = aiVerdictSchema.parse(raw)
        if (
          verdict.decision === 'same' &&
          verdict.confidence >= 0.97 &&
          !verdict.domainConflict &&
          !verdict.assumptions.length &&
          [
            'variable_rename',
            'argument_substitution',
            'term_reordering',
            'equation_rearrangement',
          ].includes(verdict.relation)
        ) {
          const match = candidates.find((x) => x.id === verdict.candidateId)
          if (!match) throw Error('Invalid candidate')
          result = { status: 'pending', versionId: v.id, match, reason: verdict.reason }
        }
      } catch {
        result = {
          status: 'unavailable',
          versionId: v.id,
          reason: 'AI判重暂不可用，已保留独立公式。',
        }
      }
    }
  }
  await db.$transaction(async (tx) => {
    await lockIdentity(tx, ownerId)
    const current = await tx.formula.findUniqueOrThrow({ where: { id }, include: latestInclude })
    const state = current.duplicateCheck as { token?: string } | null
    if (current.versions[0]?.id === v.id && !current.duplicateDecision && state?.token === token)
      await tx.formula.update({
        where: { id },
        data: {
          duplicateCheck: {
            ...result,
            fingerprint,
            until: Date.now() + 60000,
          } as Prisma.InputJsonValue,
        },
      })
  })
  return result
}
export async function decideDuplicate(
  db: PrismaClient,
  ownerId: string,
  id: string,
  input: {
    versionId: string
    matchId: string
    matchVersionId: string
    decision: 'agree' | 'ignore'
  },
) {
  return identityTransaction(db, async (tx) => {
    await lockIdentity(tx, ownerId)
    const source = await identityRoot(tx, ownerId, id),
      record = await tx.formula.findFirstOrThrow({
        where: { id, ownerId, deletedAt: null },
        include: latestInclude,
      })
    if (record.duplicateDecision) {
      if (record.duplicateDecision === input.decision) return
      throw new WorkspaceError(409, '选择已经保存，请编辑后重新判断。')
    }
    const check = record.duplicateCheck as DuplicateView | null
    const target = await tx.formula.findFirst({
      where: { id: input.matchId, ownerId, deletedAt: null },
      include: latestInclude,
    })
    if (
      !target ||
      record.versions[0]?.id !== input.versionId ||
      target.versions[0]?.id !== input.matchVersionId ||
      check?.status !== 'pending' ||
      check.match?.id !== target.id ||
      check.match.versionId !== input.matchVersionId
    )
      throw new WorkspaceError(409, '公式或匹配对象已变化，请重新核对。')
    if (input.decision === 'ignore') {
      await tx.formula.update({
        where: { id },
        data: {
          duplicateDecision: 'ignore',
          duplicateCheck: { ...check, status: 'ignore' } as Prisma.InputJsonValue,
        },
      })
      return
    }
    const root = await identityRoot(tx, ownerId, target.id)
    if (root.id === source.id) throw new WorkspaceError(409, '关联对象无效。')
    const members = await identityMembers(tx, ownerId, id),
      ids = members.map((x) => x.id)
    if (ids.includes(root.id)) throw new WorkspaceError(409, '不能循环关联。')
    const favorite = await tx.favorite.count({
      where: { ownerId, formulaId: { in: [...ids, root.id] } },
    })
    await tx.formula.updateMany({
      where: { id: { in: ids }, ownerId },
      data: {
        canonicalId: root.id,
        duplicateDecision: 'agree',
        title: root.title,
        categoryId: root.categoryId,
      },
    })
    await tx.formula.update({
      where: { id },
      data: { duplicateCheck: { ...check, status: 'agree' } as Prisma.InputJsonValue },
    })
    if (favorite) {
      const all = await identityMembers(tx, ownerId, root.id)
      await tx.favorite.createMany({
        data: all.map((x) => ({ ownerId, formulaId: x.id })),
        skipDuplicates: true,
      })
    }
  })
}
