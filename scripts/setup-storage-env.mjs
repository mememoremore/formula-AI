import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { parse } from 'dotenv'

const path = new URL('../.env', import.meta.url)
let existing
try {
  existing = await readFile(path, 'utf8')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  console.error('请先运行 npm run db:env。')
  process.exit(1)
}
const values = parse(existing)
const defaults = {
  NUXT_STORAGE_ENDPOINT: 'http://127.0.0.1:8333',
  NUXT_STORAGE_REGION: 'us-east-1',
  NUXT_STORAGE_BUCKET: 'formula-private',
  NUXT_STORAGE_ACCESS_KEY_ID: randomBytes(16).toString('hex'),
  NUXT_STORAGE_SECRET_ACCESS_KEY: randomBytes(32).toString('base64url'),
}
let updated = existing
for (const [key, value] of Object.entries(defaults)) {
  if (values[key]) continue
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  updated = pattern.test(updated) ? updated.replace(pattern, line) : `${updated}\n${line}\n`
}
if (updated !== existing) await writeFile(path, updated, { mode: 0o600 })
console.log(
  updated !== existing
    ? '已补充私有存储配置，保留原有非空配置。请重启 Nuxt。'
    : '存储配置已存在，未修改。',
)
