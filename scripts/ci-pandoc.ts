import { createHash } from 'node:crypto'
import { appendFileSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { execFileSync } from 'node:child_process'

if (
  process.platform !== 'linux' ||
  process.arch !== 'x64' ||
  process.env.GITHUB_ACTIONS !== 'true' ||
  !process.env.RUNNER_TEMP ||
  !isAbsolute(process.env.RUNNER_TEMP) ||
  !process.env.GITHUB_ENV ||
  !process.env.GITHUB_PATH
)
  throw new Error('Pandoc 安装仅支持显式 GitHub Linux x64 Runner')
const directory = mkdtempSync(join(realpathSync(process.env.RUNNER_TEMP), 'formula-pandoc-'))
const response = await fetch(
  'https://github.com/jgm/pandoc/releases/download/3.12.1/pandoc-3.12.1-linux-amd64.tar.gz',
  {
    signal: AbortSignal.timeout(120000),
  },
)
if (!response.ok) throw new Error('官方 Pandoc 包下载失败')
const bytes = Buffer.from(await response.arrayBuffer())
if (
  createHash('sha256').update(bytes).digest('hex') !==
  'd0c90410e90204c9ca83b8539fac5c7aed01fd537207e4585849f8abc5df20b8'
)
  throw new Error('官方 Pandoc 包 SHA-256 不一致，拒绝执行')
const archive = join(directory, 'pandoc.tar.gz')
writeFileSync(archive, bytes, { mode: 0o600 })
execFileSync('tar', ['-xzf', archive, '-C', directory, 'pandoc-3.12.1/bin/pandoc'])
const executable = join(directory, 'pandoc-3.12.1/bin/pandoc')
const version = execFileSync(executable, ['--version'], { encoding: 'utf8' }).split('\n')[0]
if (version !== 'pandoc 3.12.1' || /[\r\n]/.test(executable))
  throw new Error('Pandoc 版本或路径无效')
appendFileSync(process.env.GITHUB_ENV, `PANDOC_PATH=${executable}\n`)
appendFileSync(process.env.GITHUB_PATH, dirname(executable) + '\n')
console.log(`${version}，官方 SHA-256 已验证；未禁用 sandbox`)
