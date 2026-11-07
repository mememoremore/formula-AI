import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { cleanTestProcessEnvironment } from '../tests/support/test-runtime'

const args = process.argv.slice(2)
if (args.some((value) => value !== '--fix')) throw new Error('只支持--fix参数')
const env = cleanTestProcessEnvironment()
// Generate Nuxt globals/config even after CI installs with --ignore-scripts.
const prepare = spawnSync(
  process.execPath,
  ['node_modules/nuxt/bin/nuxt.mjs', 'prepare', '--dotenv', resolve('tests/support/empty.env')],
  { env, stdio: 'inherit', windowsHide: true },
)
if (prepare.status !== 0) process.exit(prepare.status ?? 1)
const lint = spawnSync(
  process.execPath,
  ['node_modules/eslint/bin/eslint.js', '.', '--max-warnings', '0', ...args],
  {
    env,
    stdio: 'inherit',
    windowsHide: true,
  },
)
process.exitCode = lint.status ?? 1
