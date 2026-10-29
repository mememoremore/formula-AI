import { PgBoss } from 'pg-boss'
import { testEnvironment } from './integration.ts'
/** 只缩短测试进程的监督准入间隔，不改真实队列的重试/保留/执行权参数。 */
export function createTestQueueClient() {
  const client = new PgBoss({
    connectionString: testEnvironment.databaseUrl,
    schema: 'pgboss',
    migrate: false,
    supervise: false,
    schedule: false,
    monitorIntervalSeconds: 1,
    max: 2,
  })
  client.on('error', () => {})
  return client
}
