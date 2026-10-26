import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cleanTestProcessEnvironment } from '../tests/support/test-runtime.ts'

const env = cleanTestProcessEnvironment()
env.NODE_OPTIONS = `--import=tsx --import=${pathToFileURL(resolve('tests/support/unit-safety.ts')).href}`
try {
  execFileSync(
    process.execPath,
    ['node_modules/nuxt/bin/nuxt.mjs', 'typecheck', '--dotenv', resolve('tests/support/empty.env')],
    { env, stdio: 'inherit', windowsHide: true },
  )
  execFileSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.database.json'],
    { env, stdio: 'inherit', windowsHide: true },
  )
} catch {
  process.exitCode = 1
}
