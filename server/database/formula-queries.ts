import type { PrismaClient } from '../generated/prisma/client'
import { imageMetadata } from './file-metadata'
import { WorkspaceError } from '../services/workspace-error'
import { hasValidResourceIdentity } from './private-resources'
import type { SavedFormula, FormulaHistoryPage } from '../../shared/types/workspace'

export async function readSavedFormula(
  db: PrismaClient,
  ownerId: string,
  id: string,
): Promise<SavedFormula> {
  if (!hasValidResourceIdentity(ownerId, id)) throw new WorkspaceError(404, '未找到这条公式。')
  const formula = await db.formula.findFirst({
    where: { id, ownerId, deletedAt: null },
    include: {
      category: { select: { id: true, name: true } },
      favorites: { where: { ownerId }, select: { formulaId: true } },
      versions: { orderBy: { number: 'asc' } },
      recognitionTask: { include: { inputFile: true } },
    },
  })
  if (!formula) throw new WorkspaceError(404, '未找到这条公式。')
  const image = formula.recognitionTask?.inputFile
  return {
    id: formula.id,
    title: formula.title,
    createdAt: formula.createdAt.toISOString(),
    updatedAt: formula.updatedAt.toISOString(),
    category: formula.category,
    favorite: formula.favorites.length > 0,
    image: image?.status === 'READY' ? imageMetadata(image) : null,
    versions: formula.versions.map((version) => ({
      id: version.id,
      number: version.number,
      latex: version.latex,
      origin: version.origin,
      isMock: version.isMock,
      createdAt: version.createdAt.toISOString(),
    })),
  }
}

export async function readFormulaHistory(
  db: PrismaClient,
  ownerId: string,
  cursor?: string,
): Promise<FormulaHistoryPage> {
  if (!hasValidResourceIdentity(ownerId, ownerId)) throw new WorkspaceError(401, '请先登录。')
  if (
    cursor &&
    (!hasValidResourceIdentity(ownerId, cursor) ||
      !(await db.formula.findFirst({
        where: { id: cursor, ownerId, deletedAt: null },
        select: { id: true },
      })))
  )
    throw new WorkspaceError(404, '未找到历史分页位置，请重新加载。')
  const page = await db.formula.findMany({
    where: { ownerId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 21,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      createdAt: true,
      versions: {
        orderBy: { number: 'desc' },
        take: 1,
        select: { latex: true, number: true, isMock: true },
      },
    },
  })
  const visible = page.slice(0, 20)
  return {
    items: visible.map((formula) => ({
      id: formula.id,
      title: formula.title,
      createdAt: formula.createdAt.toISOString(),
      latex: formula.versions[0]?.latex ?? '',
      versionNumber: formula.versions[0]?.number ?? 0,
      isMock: formula.versions[0]?.isMock ?? false,
    })),
    nextCursor: page.length > 20 ? visible.at(-1)!.id : null,
  }
}
