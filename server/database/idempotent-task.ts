import { Prisma } from '../generated/prisma/client'
import { WorkspaceError } from '../services/workspace-error'

/** 唯一请求键竞争的失败事务已经回滚，再读取胜出的任务，不重复扣额度或入队。 */
export async function idempotentTask<T>(read: () => Promise<T | null>, create: () => Promise<T>) {
  const existing = await read()
  if (existing) return existing
  try {
    return await create()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicate = await read()
      if (duplicate) return duplicate
      throw new WorkspaceError(409, '同一对话已有任务正在处理，请稍后再发送。')
    }
    throw error
  }
}
