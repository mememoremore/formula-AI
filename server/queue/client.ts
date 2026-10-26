import { PgBoss } from 'pg-boss'

export const queues = {
  recognition: 'formula-recognition',
  chat: 'formula-chat',
  export: 'formula-export',
} as const
export interface JobPayload {
  taskId: string
  ownerId: string
}

/** API 只投递；独立 Worker 执行与监督。数据库结构升级由显式 setup 命令负责。 */
export function createQueueClient(
  connectionString: string,
  options: { worker?: boolean; install?: boolean } = {},
) {
  const boss = new PgBoss({
    connectionString,
    max: options.worker ? 4 : 2,
    connectionTimeoutMillis: 5000,
    schema: 'pgboss',
    migrate: options.install ?? false,
    supervise: options.worker ?? false,
    schedule: false,
    superviseIntervalSeconds: 5,
    maintenanceIntervalSeconds: 60,
  })
  boss.on('error', () => console.error('队列连接暂时失败，请检查数据库和 Worker。'))
  return boss
}
export async function installQueues(boss: PgBoss) {
  for (const name of Object.values(queues))
    await boss.createQueue(name, {
      retryLimit: 2,
      retryDelay: 2,
      retryBackoff: true,
      expireInSeconds: 90,
      heartbeatSeconds: 10,
      retentionSeconds: 7 * 86400,
      deleteAfterSeconds: 7 * 86400,
    })
}
