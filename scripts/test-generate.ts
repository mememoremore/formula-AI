import { spawnSync } from 'node:child_process'
import { cleanTestProcessEnvironment } from '../tests/support/test-runtime.ts'
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'generate'], {
  env: cleanTestProcessEnvironment(),
  stdio: 'inherit',
  windowsHide: true,
})
process.exitCode = result.status ?? 1
