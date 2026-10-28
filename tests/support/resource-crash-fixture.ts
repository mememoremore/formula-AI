import { testEnvironment } from './integration.ts'
import { createDatabaseClient } from '../../server/database/client'
import { createObjectStore } from '../../server/storage/object-store'
import { reserveResource } from '../../server/resources/leases'
import { prepareFile } from '../../server/resources/files'
import { randomUUID } from 'node:crypto'
const db = createDatabaseClient(testEnvironment.databaseUrl)
try {
  const [ownerId, stage] = process.argv.slice(2)
  if (!ownerId || !['reserved', 'put'].includes(stage ?? ''))
    throw new Error('Invalid crash fixture')
  const user = await db.user.findUniqueOrThrow({ where: { id: ownerId } })
  if (!user.email.startsWith('resources-') || !user.email.endsWith('@formula.test'))
    throw new Error('Unowned crash fixture account')
  const bytes = Buffer.from('r12-crash-fixture')
  const lease = await reserveResource(db, {
    ownerId,
    purpose: stage === 'reserved' ? 'IMAGE_UPLOAD' : 'DOCX_WRITE',
    requestKey: randomUUID(),
    bytes: bytes.length,
  })
  if (stage === 'put') {
    const store = createObjectStore({ ...testEnvironment.storage, region: 'us-east-1' })
    const file = await prepareFile(db, lease, {
      kind: 'DOCX',
      bucket: store.bucket,
      objectKey: `${ownerId}/crash/${randomUUID()}.docx`,
      name: 'crash.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: bytes.length,
    })
    await store.put(file.objectKey, bytes, file.mimeType)
  }
  // 故意不执行 finally/$disconnect/补偿，验证已提交状态在执行进程退出后保留。
  process.exit(17)
} catch {
  process.exit(18)
}
