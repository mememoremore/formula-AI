import { testEnvironment } from '../support/integration.ts'
import { createDatabaseClient } from '../../server/database/client'
import { createObjectStore } from '../../server/storage/object-store'
import { startLeaseRecovery } from '../../server/resources/lease-recovery'
const db = createDatabaseClient(testEnvironment.databaseUrl)
const store = createObjectStore({ ...testEnvironment.storage, region: 'us-east-1' })
try {
  const control = await startLeaseRecovery(db, store, {
    enabled: true,
    intervalMs: 60000,
    batchSize: Number(process.argv[2]),
  })
  await control.stop()
  console.log('R15_LEASE_PROCESS_DONE')
} finally {
  await db.$disconnect()
}
