import type { Prisma, PrismaClient, UsageKind } from '../generated/prisma/client'
import { WorkspaceError } from '../services/workspace-error'
import type { UsageOverview } from '../../shared/types/tasks'

export interface UsageLimits {
  RECOGNITION: number
  CHAT: number
  EXPORT: number
}
export const defaultUsageLimits: UsageLimits = { RECOGNITION: 50, CHAT: 30, EXPORT: 20 }
export function usageDay(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

/** 原子条件更新，不采用进程内计数；调用者事务回滚时额度一起回滚。 */
export async function reserveUsage(
  tx: Prisma.TransactionClient,
  ownerId: string,
  kind: UsageKind,
  limit: number,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error('每日额度配置无效。')
  const rows = await tx.$queryRaw<{ used: number }[]>`
    INSERT INTO daily_usage ("ownerId", day, kind, used) VALUES (${ownerId}::uuid, ${usageDay()}::date, ${kind}::"UsageKind", 1)
    ON CONFLICT ("ownerId", day, kind) DO UPDATE SET used = daily_usage.used + 1
    WHERE daily_usage.used < ${limit} RETURNING used
  `
  if (!rows.length)
    throw new WorkspaceError(429, '今日该功能的请求额度已用完，请在次日 UTC 0点后再试。')
}
export async function readUsage(
  db: PrismaClient,
  ownerId: string,
  limits: UsageLimits,
): Promise<UsageOverview> {
  const day = usageDay()
  const rows = await db.dailyUsage.findMany({
    where: { ownerId, day: new Date(`${day}T00:00:00Z`) },
  })
  return {
    day,
    resetsAt: new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString(),
    items: (Object.keys(limits) as UsageKind[]).map((kind) => {
      const used = rows.find((row) => row.kind === kind)?.used ?? 0
      return { kind, used, limit: limits[kind], remaining: Math.max(0, limits[kind] - used) }
    }),
  }
}
