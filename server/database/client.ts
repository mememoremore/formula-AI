import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

/** Nuxt、种子脚本和数据库测试共用连接方式，但各自管理客户端生命周期。 */
export function createDatabaseClient(connectionString: string) {
  if (!connectionString) throw new Error('缺少 NUXT_DATABASE_URL，请配置本机 .env 或部署环境变量。')

  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  })

  return new PrismaClient({ adapter, errorFormat: 'minimal' })
}
