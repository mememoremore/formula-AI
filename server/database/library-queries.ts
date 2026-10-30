import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { hasValidResourceIdentity } from './private-resources'
import { WorkspaceError } from '../services/workspace-error'
import type {
  CategoryCollection,
  FormulaLibraryPage,
  FormulaLibraryFilters,
} from '../../shared/types/library'

export async function readCategories(
  db: PrismaClient,
  ownerId: string,
): Promise<CategoryCollection> {
  if (!hasValidResourceIdentity(ownerId, ownerId)) throw new WorkspaceError(401, '请先登录。')
  const [categories, totalCount, uncategorizedCount] = await db.$transaction(
    [
      db.category.findMany({
        where: { ownerId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          _count: { select: { formulas: { where: { ownerId, deletedAt: null } } } },
        },
      }),
      db.formula.count({ where: { ownerId, deletedAt: null } }),
      db.formula.count({ where: { ownerId, categoryId: null, deletedAt: null } }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
  return {
    items: categories.map((item) => ({
      id: item.id,
      name: item.name,
      formulaCount: item._count.formulas,
    })),
    totalCount,
    uncategorizedCount,
  }
}

interface LibraryRow {
  id: string
  title: string
  createdAt: Date
  latex: string
  versionNumber: number
  isMock: boolean
  categoryId: string | null
  categoryName: string | null
  favorite: boolean
  imageId: string | null
}

/** 先选最新版本再搜索；绑定参数中的 %、_、反斜杠均按普通文本匹配。 */
export async function readFormulaLibrary(
  db: PrismaClient,
  ownerId: string,
  filters: FormulaLibraryFilters,
): Promise<FormulaLibraryPage> {
  if (!hasValidResourceIdentity(ownerId, ownerId)) throw new WorkspaceError(401, '请先登录。')
  const conditions = [Prisma.sql`f."ownerId" = ${ownerId}::uuid`, Prisma.sql`f."deletedAt" IS NULL`]
  if (filters.category === 'uncategorized') conditions.push(Prisma.sql`f."categoryId" IS NULL`)
  else if (filters.category) {
    const category =
      hasValidResourceIdentity(ownerId, filters.category) &&
      (await db.category.findFirst({
        where: { id: filters.category, ownerId },
        select: { id: true },
      }))
    if (!category) throw new WorkspaceError(404, '未找到这个分类，请重新选择。')
    conditions.push(Prisma.sql`f."categoryId" = ${filters.category}::uuid`)
  }
  if (filters.cursor) {
    const anchor =
      hasValidResourceIdentity(ownerId, filters.cursor) &&
      (await db.formula.findFirst({
        where: { id: filters.cursor, ownerId, deletedAt: null },
        select: { id: true, createdAt: true },
      }))
    if (!anchor) throw new WorkspaceError(404, '分页位置已失效，请重新加载。')
    conditions.push(
      Prisma.sql`(f."createdAt", f.id) < (${anchor.createdAt}::timestamptz, ${anchor.id}::uuid)`,
    )
  }
  if (filters.favorites) conditions.push(Prisma.sql`fav."formulaId" IS NOT NULL`)
  if (filters.q)
    conditions.push(Prisma.sql`(
    position(lower(${filters.q}) in lower(f.title)) > 0 OR
    position(lower(${filters.q}) in lower(v.latex)) > 0
  )`)

  // LATERAL 复用 (formulaId, number) 唯一索引，不加载所有历史版本。
  const rows = await db.$queryRaw<LibraryRow[]>(Prisma.sql`
    SELECT f.id, f.title, f."createdAt", v.latex, v.number AS "versionNumber", v."isMock",
      c.id AS "categoryId", c.name AS "categoryName", (fav."formulaId" IS NOT NULL) AS favorite, image.id AS "imageId"
    FROM formulas f
    JOIN LATERAL (
      SELECT latex, number, "isMock" FROM formula_versions
      WHERE "formulaId" = f.id AND "ownerId" = ${ownerId}::uuid
      ORDER BY number DESC LIMIT 1
    ) v ON true
    LEFT JOIN categories c ON c.id = f."categoryId" AND c."ownerId" = ${ownerId}::uuid
    LEFT JOIN favorites fav ON fav."formulaId" = f.id AND fav."ownerId" = ${ownerId}::uuid
    LEFT JOIN recognition_tasks t ON t.id=f."recognitionTaskId" AND t."ownerId"=${ownerId}::uuid
    LEFT JOIN stored_files image ON image.id=t."inputFileId" AND image."ownerId"=${ownerId}::uuid AND image.status='READY'
    WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY f."createdAt" DESC, f.id DESC LIMIT 21
  `)
  const visible = rows.slice(0, 20)
  return {
    items: visible.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      latex: row.latex,
      versionNumber: row.versionNumber,
      isMock: row.isMock,
      category: row.categoryId ? { id: row.categoryId, name: row.categoryName! } : null,
      favorite: row.favorite,
      imageId: row.imageId,
    })),
    nextCursor: rows.length > 20 ? visible.at(-1)!.id : null,
  }
}
