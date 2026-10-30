import type { PrismaClient } from '../generated/prisma/client'

const resourceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 必填身份和资源标识先校验，避免 Prisma 忽略 undefined 后放宽查询。 */
export function hasValidResourceIdentity(ownerId: unknown, id: unknown): ownerId is string {
  return (
    typeof ownerId === 'string' &&
    resourceIdPattern.test(ownerId) &&
    typeof id === 'string' &&
    resourceIdPattern.test(id)
  )
}

/** 只选择产品允许展示的字段；文件存储路径、认证凭据不进入响应。 */
export async function readPrivateResource(
  db: PrismaClient,
  ownerId: string,
  kind: string,
  id: string,
) {
  if (!hasValidResourceIdentity(ownerId, id)) return null
  const where = { id, ownerId }
  switch (kind) {
    case 'formulas':
      return db.formula.findFirst({
        where: { ...where, deletedAt: null },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          versions: {
            orderBy: { number: 'desc' },
            select: { id: true, number: true, latex: true, isMock: true, origin: true },
          },
        },
      })
    case 'versions':
      return db.formulaVersion.findFirst({
        where,
        select: { id: true, formulaId: true, number: true, latex: true, isMock: true },
      })
    case 'files':
      return db.storedFile.findFirst({
        where,
        select: { id: true, name: true, kind: true, status: true, mimeType: true, sizeBytes: true },
      })
    case 'tasks':
      return db.recognitionTask.findFirst({
        where,
        select: { id: true, inputFileId: true, status: true, mode: true, createdAt: true },
      })
    case 'categories':
      return db.category.findFirst({ where, select: { id: true, name: true } })
    case 'conversations':
      return db.conversation.findFirst({
        where,
        select: {
          id: true,
          title: true,
          formulaVersionId: true,
          messages: {
            where: { ownerId },
            orderBy: { position: 'asc' },
            take: 100,
            select: {
              id: true,
              role: true,
              content: true,
              status: true,
              isMock: true,
              position: true,
            },
          },
        },
      })
    default:
      return null
  }
}

export async function readAccountOverview(db: PrismaClient, ownerId: string) {
  if (!resourceIdPattern.test(ownerId ?? '')) throw new Error('缺少有效的账号身份。')
  const where = { ownerId }
  const [formulas, files, tasks, conversations, recentFormulas] = await Promise.all([
    db.formula.count({ where: { ...where, deletedAt: null } }),
    db.storedFile.count({ where: { ...where, status: 'READY' } }),
    db.recognitionTask.count({ where }),
    db.conversation.count({ where }),
    db.formula.findMany({
      where: { ...where, deletedAt: null },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: 10,
      select: { id: true, title: true, updatedAt: true },
    }),
  ])
  return { counts: { formulas, files, tasks, conversations }, formulas: recentFormulas }
}
