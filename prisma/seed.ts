import 'dotenv/config'
import { createDatabaseClient } from '../server/database/client'
import { seedDatabase } from './seed-data'

const db = createDatabaseClient(process.env.NUXT_DATABASE_URL ?? '')
try {
  await seedDatabase(db)
  console.log(
    '开发种子已写入：2 名样例用户、各自资源、原始/修订版本及固定对话。重复执行不会覆盖已有数据。',
  )
  console.log('文件行仅为 PENDING 元数据，不代表私有对象存储中已经存在图片。')
} finally {
  await db.$disconnect()
}
