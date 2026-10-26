import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { cleanTestProcessEnvironment } from '../tests/support/test-runtime.ts'

// 复用 R1 的干净环境，不创建数据库、不部署迁移，不读取开发 .env。
const env = cleanTestProcessEnvironment()
Object.assign(env, {
  CI: '1',
  NUXT_DATABASE_URL: '',
  NUXT_AUTH_SECRET: '',
  NUXT_AUTH_BASE_URL: '',
  NUXT_STORAGE_ENDPOINT: '',
  NUXT_STORAGE_ACCESS_KEY_ID: '',
  NUXT_STORAGE_SECRET_ACCESS_KEY: '',
  NUXT_AI_PROVIDER: 'mock',
  NUXT_AI_API_KEY: '',
  NUXT_RECOGNITION_PROVIDER: 'mock',
  NUXT_RECOGNITION_API_KEY: '',
})
const command = process.argv[2] ?? 'dev'
if (!['dev', 'typecheck'].includes(command)) throw new Error('只支持设计预览或设计样板类型检查')
const args =
  command === 'dev' ? ['dev', '--no-fork', '--host', '127.0.0.1', '--port', '3200'] : ['typecheck']
const child = spawn(
  process.execPath,
  [
    'node_modules/nuxt/bin/nuxt.mjs',
    ...args,
    '--dotenv',
    resolve('tests/support/empty.env'),
    '--extends',
    resolve('tests/design-preview'),
  ],
  { env, stdio: 'inherit', windowsHide: true },
)
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => child.kill(signal))
child.on('error', () => {
  console.error('设计预览无法启动')
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
