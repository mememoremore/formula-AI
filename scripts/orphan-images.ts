import 'dotenv/config'
import { createDatabaseClient } from '../server/database/client'
import { createObjectStore } from '../server/storage/object-store'
import { cleanupFile, scanStorage } from '../server/resources/cleanup'
import { assertLocalDocker } from '../tests/support/test-runtime'
const args = process.argv.slice(2)
if (args.some((v) => v !== '--apply' && !v.startsWith('--file=') && !v.startsWith('--bucket=')))
  throw new Error('Unsupported storage audit option')
const apply = args.includes('--apply'),
  fileId = args.find((v) => v.startsWith('--file='))?.slice(7),
  confirmedBucket = args.find((v) => v.startsWith('--bucket='))?.slice(9)
if (fileId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(fileId))
  throw new Error('Invalid file ID')
const databaseUrl = process.env.NUXT_DATABASE_URL ?? '',
  endpoint = process.env.NUXT_STORAGE_ENDPOINT ?? '',
  bucket = process.env.NUXT_STORAGE_BUCKET ?? ''
try {
  const database = new URL(databaseUrl),
    storage = new URL(endpoint)
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !['http:', 'https:'].includes(storage.protocol) ||
    [database, storage].some((url) => !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new Error()
} catch {
  throw new Error('This audit command requires valid local service configuration')
}
if (
  args.filter((v) => v.startsWith('--file=')).length > 1 ||
  args.filter((v) => v.startsWith('--bucket=')).length > 1
)
  throw new Error('Duplicate audit options are not allowed')
assertLocalDocker()
if (apply && (!fileId || !bucket || confirmedBucket !== bucket))
  throw new Error('Apply requires one file ID and explicit current bucket confirmation')
const db = createDatabaseClient(databaseUrl)
const store = createObjectStore({
  endpoint,
  bucket,
  region: process.env.NUXT_STORAGE_REGION ?? 'us-east-1',
  accessKeyId: process.env.NUXT_STORAGE_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.NUXT_STORAGE_SECRET_ACCESS_KEY ?? '',
})
try {
  if (fileId)
    console.log(
      JSON.stringify({
        mode: apply ? 'apply' : 'report',
        fileId,
        ...(await cleanupFile(db, store, fileId, { apply, managedImageBucket: bucket })),
      }),
    )
  else {
    const findings = await scanStorage(db, store)
    const summary: Record<string, number> = {}
    for (const row of findings) summary[row.state] = (summary[row.state] ?? 0) + 1
    console.log(JSON.stringify({ mode: 'report', summary, findings }, null, 2))
  }
} catch {
  console.error('资源核对未完成，未输出私有错误；请保留当前状态后重试。')
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
