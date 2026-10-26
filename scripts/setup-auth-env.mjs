import { randomBytes } from 'node:crypto'
import { writeFile, readFile } from 'node:fs/promises'
import { parse } from 'dotenv'

const path = new URL('../.env', import.meta.url)
let existing
try {
  existing = await readFile(path, 'utf8')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  console.error('请先运行 npm run db:env 创建本机数据库配置。')
  process.exit(1)
}
const values = parse(existing)
let updated = existing
function fillEmptyValue(key, value) {
  if (values[key]) return
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  updated = pattern.test(updated) ? updated.replace(pattern, line) : `${updated}\n${line}\n`
}
fillEmptyValue('NUXT_AUTH_SECRET', randomBytes(48).toString('base64url'))
fillEmptyValue('NUXT_AUTH_BASE_URL', 'http://127.0.0.1:3000')
if (updated !== existing) await writeFile(path, updated, { mode: 0o600 })
console.log(
  updated !== existing
    ? '已补充空缺的账号配置，保留其他配置。请重启 Nuxt。'
    : '账号配置已存在，未修改。',
)
