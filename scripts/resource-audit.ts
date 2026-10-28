// 必须先通过 R1 容器、API、数据库和桶的一致性验证，之后才导入客户端或接触存储。
import { testEnvironment } from '../tests/support/integration.ts'
import { createDatabaseClient } from '../server/database/client'
import { createObjectStore } from '../server/storage/object-store'
import { scanStorage, cleanupFile, reconcileExpiredLeases } from '../server/resources/cleanup'
const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--apply' && arg !== '--reconcile' && !arg.startsWith('--file=')))
  throw new Error('Unsupported resource audit option')
const apply = args.includes('--apply'),
  reconcile = args.includes('--reconcile')
const id = args.find((arg) => arg.startsWith('--file='))?.slice(7)
if ((apply && !id) || (apply && reconcile) || (id && !/^[a-f0-9-]{36}$/.test(id)))
  throw new Error('Apply requires one explicit isolated file ID')
const db = createDatabaseClient(testEnvironment.databaseUrl)
const store = createObjectStore({ ...testEnvironment.storage, region: 'us-east-1' })
try {
  if (reconcile) console.log(JSON.stringify(await reconcileExpiredLeases(db)))
  else if (id)
    console.log(
      JSON.stringify(
        await cleanupFile(db, store, id, {
          apply,
          verifiedTestBucket: testEnvironment.storage.bucket,
        }),
      ),
    )
  else {
    const findings = await scanStorage(db, store)
    const summary: Record<string, number> = {}
    for (const finding of findings) summary[finding.state] = (summary[finding.state] ?? 0) + 1
    console.log(
      JSON.stringify({ mode: 'dry-run', objects: findings.length, summary, findings }, null, 2),
    )
  }
} catch (error) {
  console.error(
    '资源核对未完成，停止后续操作：',
    error instanceof Error ? error.name : 'UnknownError',
  )
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
