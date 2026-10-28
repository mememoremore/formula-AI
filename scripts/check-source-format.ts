import { spawnSync } from 'node:child_process'
import { cleanTestProcessEnvironment } from '../tests/support/test-runtime.ts'

// Runtime source and executable config; historical audit/governance documents are immutable inputs.
const result = spawnSync(
  process.execPath,
  [
    'node_modules/prettier/bin/prettier.cjs',
    '--check',
    'app',
    'shared',
    'server',
    'scripts',
    'tests',
    'prisma/*.ts',
    '*.json',
    '*.ts',
    '*.yaml',
    '.github/**/*.yml',
  ],
  {
    env: cleanTestProcessEnvironment(),
    stdio: 'inherit',
    windowsHide: true,
  },
)
process.exitCode = result.status ?? 1
