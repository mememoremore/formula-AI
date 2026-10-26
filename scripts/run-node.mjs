import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [major, minor, patch] = process.versions.node.split('.').map(Number)
const supported =
  major >= 26 ||
  (major === 24 && minor >= 15) ||
  (major === 22 && (minor > 22 || (minor === 22 && patch >= 3)))
const portableNode = fileURLToPath(
  new URL('../.tools/node-v24.22.0-win-x64/node.exe', import.meta.url),
)
const runtime = supported ? process.execPath : portableNode

if (!supported && !existsSync(portableNode)) {
  console.error(
    'Nuxt 需要 Node 22.22.3+（22.x）、24.15.0+（24.x）或 26+。请使用受支持的 Node 版本。',
  )
  process.exit(1)
}

// 只选择执行程序并转发参数，不注入环境变量、不拼接 Shell 命令。
const child = spawn(runtime, process.argv.slice(2), { stdio: 'inherit', env: process.env })
child.on('error', () => {
  console.error('无法启动项目运行时，请检查 Node 安装。')
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
