import 'dotenv/config'
import { createDatabaseClient } from '../server/database/client'

const db = createDatabaseClient(process.env.NUXT_DATABASE_URL ?? '')
try {
  const [database] = await db.$queryRaw<
    { name: string; version: string }[]
  >`SELECT current_database() AS name, current_setting('server_version') AS version`
  const counts = {
    users: await db.user.count(),
    stored_files: await db.storedFile.count(),
    recognition_tasks: await db.recognitionTask.count(),
    formulas: await db.formula.count(),
    formula_versions: await db.formulaVersion.count(),
    categories: await db.category.count(),
    favorites: await db.favorite.count(),
    conversations: await db.conversation.count(),
    chat_messages: await db.chatMessage.count(),
  }
  console.log(`已连接 PostgreSQL ${database?.version}，数据库 ${database?.name}。`)
  console.table(counts)
} finally {
  await db.$disconnect()
}
