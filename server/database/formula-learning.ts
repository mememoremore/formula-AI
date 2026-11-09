import type { PrismaClient, Prisma } from '../generated/prisma/client'
import { identityRoot, lockIdentity } from './formula-identities'
import { WorkspaceError } from '../services/workspace-error'
import { randomUUID } from 'node:crypto'
import { explanationConditions } from './learning-context'
import {
  learningInput,
  reviewInput,
  reviewSchedule,
  learningQuestions,
  type FormulaLearningView,
} from '../../shared/schemas/learning'

type Learning = NonNullable<Awaited<ReturnType<PrismaClient['formulaLearning']['findFirst']>>>
export function learningView(row: Learning | null): FormulaLearningView {
  return {
    revision: row?.revision ?? 0,
    notes: row?.notes ?? '',
    conditions: row?.conditions ?? '',
    question: row?.question ?? '',
    tags: row?.tags ?? [],
    questions: learningQuestions.safeParse(row?.questions ?? []).data ?? [],
    questionsInitialized: row?.questionsInitialized ?? false,
    conditionsCustomized: row?.conditionsCustomized ?? false,
    mastery: row?.mastery === 'MASTERED' ? 'MASTERED' : 'UNFAMILIAR',
    masteryNotes: row?.masteryNotes ?? '',
    reviewEnabled: row?.reviewEnabled ?? false,
    intervalDays: row?.intervalDays ?? 0,
    nextReviewAt: row?.nextReviewAt?.toISOString() ?? null,
  }
}
export async function readLearning(
  db: PrismaClient | Prisma.TransactionClient,
  owner: string,
  id: string,
) {
  const root = await identityRoot(db, owner, id)
  const value = learningView(
    await db.formulaLearning.findFirst({ where: { formulaId: root.id, ownerId: owner } }),
  )
  if (!value.conditionsCustomized)
    value.conditions = await explanationConditions(db, owner, root.id)
  return value
}
export async function saveLearning(
  db: PrismaClient,
  owner: string,
  id: string,
  raw: unknown,
  review = false,
) {
  const input = review ? reviewInput.safeParse(raw) : learningInput.safeParse(raw)
  if (!input.success) throw new WorkspaceError(400, '学习笔记格式无效，请检查字数、问题和答案。')
  return db.$transaction(async (tx) => {
    await lockIdentity(tx, owner)
    const root = await identityRoot(tx, owner, id)
    const existing = await tx.formulaLearning.findUnique({ where: { formulaId: root.id } })
    if ((existing?.revision ?? 0) !== input.data.revision)
      throw new WorkspaceError(409, '学习笔记已在其他窗口修改，请刷新页面核对后再保存。')
    if (review) {
      const value = reviewInput.parse(input.data)
      if (!existing?.reviewEnabled) throw new WorkspaceError(409, '请先将公式加入复习。')
      const schedule = reviewSchedule(value.rating, existing.intervalDays, new Date())
      return learningView(
        await tx.formulaLearning.update({
          where: { formulaId: root.id },
          data: { ...schedule, revision: { increment: 1 } },
        }),
      )
    }
    const {
      revision: _revision,
      questions: suppliedQuestions,
      question,
      ...value
    } = learningInput.parse(input.data)
    const questions =
      suppliedQuestions ??
      (question === undefined
        ? undefined
        : question.trim()
          ? [{ id: randomUUID(), question: question.trim(), answer: '', source: 'manual' as const }]
          : [])
    const data = {
      ...value,
      conditionsCustomized: value.conditionsCustomized ?? true,
      ...(questions === undefined
        ? {}
        : { questions, questionsInitialized: true, question: questions[0]?.question ?? '' }),
    }
    const nextReviewAt = value.reviewEnabled ? (existing?.nextReviewAt ?? new Date()) : null
    return learningView(
      await tx.formulaLearning.upsert({
        where: { formulaId: root.id },
        create: { ...data, formulaId: root.id, ownerId: owner, nextReviewAt, revision: 1 },
        update: { ...data, nextReviewAt, revision: { increment: 1 } },
      }),
    )
  })
}
