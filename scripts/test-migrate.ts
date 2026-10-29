import { testEnvironment } from '../tests/support/integration.ts'
import { execFileSync } from 'node:child_process'
import { isolatedChildEnvironment } from '../tests/support/test-runtime.ts'
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  env: isolatedChildEnvironment(testEnvironment, process.env.FORMULA_TEST_MANIFEST!),
  stdio: 'inherit',
  windowsHide: true,
})
