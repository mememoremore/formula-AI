import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
const template = new URL('./production.env.example', import.meta.url)
const target = new URL('./.env.production', import.meta.url)
let content = await readFile(template, 'utf8')
for (const name of [
  'POSTGRES_PASSWORD',
  'NUXT_AUTH_SECRET',
  'NUXT_STORAGE_ACCESS_KEY_ID',
  'NUXT_STORAGE_SECRET_ACCESS_KEY',
  'NUXT_RECOGNITION_API_KEY',
])
  content = content.replace(
    new RegExp(`^${name}=$`, 'm'),
    `${name}=${randomBytes(32).toString('hex')}`,
  )
try {
  await writeFile(target, content, { flag: 'wx', mode: 0o600 })
  console.log(
    'Created deploy/.env.production. Fill AI and SMTP keys privately; existing files are never overwritten.',
  )
} catch (error) {
  if (error.code === 'EEXIST') console.log('Existing production environment preserved.')
  else throw error
}
