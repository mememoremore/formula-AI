import { mkdirSync, openSync, closeSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { cleanTestProcessEnvironment } from '../tests/support/test-runtime.ts'

mkdirSync('tmp/r16-quality', { recursive: true, mode: 0o700 })
const stages = [
  ['generate', 'scripts/test-generate.ts'],
  ['lint', 'scripts/check-lint.ts'],
  ['format', 'scripts/check-source-format.ts'],
  ['assets', 'scripts/check-assets.ts'],
  ['types', 'scripts/check-types.ts'],
  ['unit', 'scripts/test-suite.ts', 'unit', 'coverage'],
  ['protocols', 'scripts/test-suite.ts', 'protocols'],
  ['build-and-private-scan', 'scripts/test-build.ts'],
] as const
for (const [name, ...args] of stages) {
  const started = Date.now()
  const fd = openSync(resolve('tmp/r16-quality', name + '.log'), 'w', 0o600)
  const result = spawnSync(process.execPath, ['--import=tsx', ...args], {
    env: cleanTestProcessEnvironment(),
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  })
  closeSync(fd)
  console.log(`${name}: exit=${result.status ?? 1}, ${((Date.now() - started) / 1000).toFixed(1)}s`)
  if (name === 'unit' && result.status === 0) {
    const coverage = JSON.parse(readFileSync('artifacts/coverage/coverage-summary.json', 'utf8'))
      .total as Record<string, { pct: number }>
    console.log(
      'Vitest coverage (declared frontend/shared scope): ' +
        ['lines', 'branches', 'functions', 'statements']
          .map((key) => key + '=' + coverage[key]!.pct + '%')
          .join(', '),
    )
  }
  if (result.status !== 0) {
    process.exitCode = 1
    break
  }
}
