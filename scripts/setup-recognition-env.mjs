import { randomBytes } from 'node:crypto'
import { readFile, writeFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'dotenv'

const path = new URL('../.env', import.meta.url)
const existing = await readFile(path, 'utf8')
const values = parse(existing)
const modelPath = values.RECOGNITION_MODEL_PATH || '../model'
for (const name of ['inference.json', 'inference.pdiparams', 'inference.yml']) {
  try {
    await access(resolve(process.cwd(), modelPath, name))
  } catch {
    throw new Error(`模型导出文件缺失：${name}。请在.env设置RECOGNITION_MODEL_PATH。`)
  }
}
const defaults = {
  NUXT_RECOGNITION_PROVIDER: 'python',
  NUXT_RECOGNITION_SERVICE_URL: `http://127.0.0.1:${values.RECOGNITION_PORT || '8001'}`,
  NUXT_RECOGNITION_API_KEY: randomBytes(32).toString('base64url'),
  RECOGNITION_MODEL_PATH: '../model',
  RECOGNITION_PORT: '8001',
  RECOGNITION_CPU_THREADS: '4',
}
let updated = existing
for (const [key, value] of Object.entries(defaults)) {
  if (values[key]) continue
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  updated = pattern.test(updated)
    ? updated.replace(pattern, `${key}=${value}`)
    : `${updated.trimEnd()}\n${key}=${value}\n`
}
if (updated !== existing) await writeFile(path, updated, { mode: 0o600 })
console.log('识别配置已就绪，保留所有原有非空配置与其他服务凭据；未输出密钥。')
console.log('需要切换来源时设置NUXT_RECOGNITION_PROVIDER=python，再重启Worker。')
