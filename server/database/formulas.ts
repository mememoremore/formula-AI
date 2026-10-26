import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { DatabaseOperationError } from './errors'
import { hasValidResourceIdentity } from './private-resources'

interface CreateFormulaInput {
  ownerId: string
  title: string
  latex: string
  categoryId?: string | null
  recognitionTaskId?: string
  origin: 'RECOGNITION' | 'DEMO'
  modelVersion?: string
  isMock?: boolean
}

function checkedLatex(latex: string) {
  const value = latex.trim()
  if (!value || value.length > 5000) {
    throw new DatabaseOperationError('INVALID_INPUT', 'LaTeX 需要包含 1～5000 个字符。')
  }
  return value
}

export async function createFormula(db: PrismaClient, input: CreateFormulaInput) {
  return db.$transaction((tx) => createFormulaInTransaction(tx, input))
}

/** 让识别任务、公式和首版本可以放进同一个外层事务。 */
export async function createFormulaInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateFormulaInput,
) {
  const latex = checkedLatex(input.latex)
  const title = input.title.trim()
  if (!title || title.length > 100) {
    throw new DatabaseOperationError('INVALID_INPUT', '公式名称需要包含 1～100 个字符。')
  }

  const formula = await tx.formula.create({
    data: {
      ownerId: input.ownerId,
      title,
      categoryId: input.categoryId,
      recognitionTaskId: input.recognitionTaskId,
    },
  })
  const version = await tx.formulaVersion.create({
    data: {
      ownerId: input.ownerId,
      formulaId: formula.id,
      number: 1,
      latex,
      origin: input.origin,
      modelVersion: input.modelVersion,
      isMock: input.isMock ?? false,
    },
  })
  return { formula, version }
}

export async function getFormula(db: PrismaClient, ownerId: string, formulaId: string) {
  if (!hasValidResourceIdentity(ownerId, formulaId)) return null
  return db.formula.findFirst({
    where: { id: formulaId, ownerId },
    include: {
      category: true,
      versions: { orderBy: { number: 'asc' } },
      favorites: { where: { ownerId } },
    },
  })
}

interface AppendVersionInput {
  ownerId: string
  formulaId: string
  expectedVersionId: string
  latex: string
  title?: string
}

/** 只有新增版本操作，没有覆盖版本操作；调用者必须提供编辑时看到的版本 ID。 */
export async function appendFormulaVersion(db: PrismaClient, input: AppendVersionInput) {
  if (
    !hasValidResourceIdentity(input.ownerId, input.formulaId) ||
    !hasValidResourceIdentity(input.ownerId, input.expectedVersionId)
  ) {
    throw new DatabaseOperationError('INVALID_INPUT', '缺少有效的用户或公式版本标识。')
  }
  const latex = checkedLatex(input.latex)
  const title = input.title?.trim()
  if (title !== undefined && (!title || title.length > 100))
    throw new DatabaseOperationError('INVALID_INPUT', '公式名称需要包含 1～100 个字符。')
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          const formula = await tx.formula.findFirst({
            where: { id: input.formulaId, ownerId: input.ownerId },
          })
          if (!formula) throw new DatabaseOperationError('NOT_FOUND', '未找到这条公式。')

          const latest = await tx.formulaVersion.findFirst({
            where: { formulaId: formula.id, ownerId: input.ownerId },
            orderBy: { number: 'desc' },
          })
          if (!latest || latest.id !== input.expectedVersionId) {
            throw new DatabaseOperationError(
              'VERSION_CONFLICT',
              '公式已被修改，请重新读取最新版本。',
            )
          }
          if (latex === latest.latex) {
            if (title !== undefined && title !== formula.title)
              await tx.formula.update({
                where: { id: formula.id },
                data: { title, updatedAt: new Date() },
              })
            return latest
          }

          const version = await tx.formulaVersion.create({
            data: {
              formulaId: formula.id,
              ownerId: input.ownerId,
              number: latest.number + 1,
              latex,
              origin: 'MANUAL',
              isMock: latest.isMock,
            },
          })
          await tx.formula.update({
            where: { id: formula.id },
            data: { ...(title === undefined ? {} : { title }), updatedAt: new Date() },
          })
          return version
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
    } catch (error) {
      // 并发提交可能产生序列化冲突或唯一版本号冲突，重新读取后再校验预期版本。
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2002')
      if (!retryable || attempt === 2) throw error
    }
  }
  throw new Error('未能完成公式版本事务。')
}
