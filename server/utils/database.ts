import { createDatabaseClient } from '../database/client'
import type { PrismaClient } from '../generated/prisma/client'

const processState = globalThis as typeof globalThis & { formulaDatabase?: PrismaClient }

/** 延迟连接，避免前端预览依赖数据库；开发热更新时复用同一连接池。 */
export function getDatabase() {
  const { databaseUrl } = useRuntimeConfig()
  if (!databaseUrl) {
    throw createError({ statusCode: 503, message: '数据库尚未配置。' })
  }
  processState.formulaDatabase ??= createDatabaseClient(databaseUrl)
  return processState.formulaDatabase
}
