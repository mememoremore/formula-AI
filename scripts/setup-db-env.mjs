import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const template = await readFile(new URL('../.env.example', import.meta.url), 'utf8')
const password = randomBytes(24).toString('base64url')
const content = template.replaceAll('formula_local_dev', password)

try {
  await writeFile(new URL('../.env', import.meta.url), content, { flag: 'wx', mode: 0o600 })
  console.log('已创建本机 .env 和随机开发密码。密码未输出，文件已被 Git 忽略。')
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  console.log('.env 已存在，保留现有配置；请确认其中的数据库连接设置。')
}
