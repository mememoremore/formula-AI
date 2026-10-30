import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { hasValidResourceIdentity } from './private-resources'
import { checkedCategoryName } from '../services/library-input'
import { WorkspaceError } from '../services/workspace-error'
import type { AccountCategory } from '../../shared/types/library'

async function categoryTransaction<T>(
  db: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2034' && attempt < 3) continue
        if (error.code === 'P2002') throw new WorkspaceError(409, '已经有同名分类，请换一个名称。')
        if (error.code === 'P2025') throw new WorkspaceError(404, '记录已不存在，请刷新列表。')
        if (error.code === 'P2003' || error.code === 'P2034')
          throw new WorkspaceError(409, '分类刚刚发生变化，请刷新后重试。')
      }
      throw error
    }
  }
  throw new WorkspaceError(409, '操作冲突，请刷新后重试。')
}

async function ownedCategory(tx: Prisma.TransactionClient, ownerId: string, id: string) {
  const category =
    hasValidResourceIdentity(ownerId, id) &&
    (await tx.category.findFirst({ where: { id, ownerId } }))
  if (!category) throw new WorkspaceError(404, '未找到这个分类。')
  return category
}
async function ownedFormula(tx: Prisma.TransactionClient, ownerId: string, id: string) {
  const formula =
    hasValidResourceIdentity(ownerId, id) &&
    (await tx.formula.findFirst({
      where: { id, ownerId, deletedAt: null },
      select: { id: true },
    }))
  if (!formula) throw new WorkspaceError(404, '未找到这条公式。')
  return formula
}

export async function createCategory(
  db: PrismaClient,
  ownerId: string,
  input: unknown,
): Promise<AccountCategory> {
  if (!hasValidResourceIdentity(ownerId, ownerId)) throw new WorkspaceError(401, '请先登录。')
  const name = checkedCategoryName(input)
  return categoryTransaction(db, async (tx) => {
    const category = await tx.category.create({
      data: { ownerId, name },
      select: { id: true, name: true },
    })
    return { ...category, formulaCount: 0 }
  })
}
export async function renameCategory(
  db: PrismaClient,
  ownerId: string,
  id: string,
  input: unknown,
) {
  const name = checkedCategoryName(input)
  return categoryTransaction(db, async (tx) => {
    await ownedCategory(tx, ownerId, id)
    await tx.category.update({ where: { id_ownerId: { id, ownerId } }, data: { name } })
    return { id, name }
  })
}
export async function removeCategory(db: PrismaClient, ownerId: string, id: string) {
  return categoryTransaction(db, async (tx) => {
    await ownedCategory(tx, ownerId, id)
    // 复合外键含 ownerId，不能使用 SET NULL；先清分类，再删分类，整个事务保留公式。
    await tx.formula.updateMany({ where: { ownerId, categoryId: id }, data: { categoryId: null } })
    await tx.category.delete({ where: { id_ownerId: { id, ownerId } } })
    return { deleted: true }
  })
}
export async function assignFormulaCategory(
  db: PrismaClient,
  ownerId: string,
  id: string,
  categoryId: string | null,
) {
  return categoryTransaction(db, async (tx) => {
    await ownedFormula(tx, ownerId, id)
    if (categoryId !== null) await ownedCategory(tx, ownerId, categoryId)
    await tx.formula.update({ where: { id_ownerId: { id, ownerId } }, data: { categoryId } })
  })
}
export async function setFormulaFavorite(
  db: PrismaClient,
  ownerId: string,
  id: string,
  favorite: boolean,
) {
  // 显式设置目标状态，重复请求不会反向切换；唯一主键保证并发收藏也只有一条。
  await db.$transaction(async (tx) => {
    await ownedFormula(tx, ownerId, id)
    if (favorite)
      await tx.favorite.createMany({ data: [{ ownerId, formulaId: id }], skipDuplicates: true })
    else await tx.favorite.deleteMany({ where: { ownerId, formulaId: id } })
  })
  return { favorite }
}
