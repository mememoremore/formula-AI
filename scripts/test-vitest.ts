import { spawn } from 'node:child_process'
import { cleanTestProcessEnvironment } from '../tests/support/test-runtime'
const mode = process.argv[2] ?? 'run'
if (!['run', 'watch', 'components', 'coverage'].includes(mode))
  throw new Error('Unknown Vitest mode')
const args = ['node_modules/vitest/vitest.mjs', mode === 'watch' ? '--watch' : 'run']
if (mode === 'components') args.push('--project', 'components')
if (mode === 'coverage') args.push('--coverage')
const child = spawn(process.execPath, args, {
  env: cleanTestProcessEnvironment(),
  stdio: 'inherit',
  windowsHide: true,
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => child.kill(signal))
process.exitCode = await new Promise<number>((resolve, reject) => {
  child.once('error', reject)
  child.once('exit', (code) => resolve(code ?? 1))
})
