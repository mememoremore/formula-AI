import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { sourceFingerprint, publicBuildFiles } from '../tests/support/build-receipt.ts'
import { cleanTestProcessEnvironment } from '../tests/support/test-runtime.ts'

const receipt = resolve('tmp/r1-test/client-build-receipt.json')
try {
  mkdirSync('tmp/r1-test', { recursive: true })
  // 先作废上次成功凭据，防止本次失败后仍扫描旧产物获得“通过”。
  writeFileSync(
    receipt,
    JSON.stringify({ status: 'building', startedAt: new Date().toISOString() }),
  )
  const env = cleanTestProcessEnvironment()
  const markers = {
    NUXT_DATABASE_URL:
      'postgresql://fixture:formula-ai-private-check-20261020@127.0.0.1:15432/unused_build_fixture',
    NUXT_AUTH_SECRET: 'formula-ai-private-auth-build-marker-20261026',
    NUXT_AUTH_BASE_URL: 'http://127.0.0.1:3100',
    NUXT_AI_API_KEY: 'formula-ai-private-ai-check-day13',
    NUXT_RECOGNITION_API_KEY: 'formula-ai-private-recognition-build-marker',
    NUXT_STORAGE_ACCESS_KEY_ID: 'formula-ai-private-storage-build-id',
    NUXT_STORAGE_SECRET_ACCESS_KEY: 'formula-ai-private-storage-build-secret',
    NUXT_STORAGE_ENDPOINT: 'http://127.0.0.1:18333',
  }
  Object.assign(env, markers, {
    NUXT_AI_PROVIDER: 'mock',
    NUXT_RECOGNITION_PROVIDER: 'mock',
    NUXT_TELEMETRY_DISABLED: '1',
    DOTENV_CONFIG_PATH: resolve('tests/support/empty.env'),
    DOTENV_CONFIG_OVERRIDE: 'false',
    DO_NOT_TRACK: '1',
    NODE_OPTIONS: `--import=tsx --import=${pathToFileURL(resolve('tests/support/unit-safety.ts')).href}`,
  })
  const fingerprint = sourceFingerprint()
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'generate'], {
    env,
    stdio: 'inherit',
    windowsHide: true,
  })
  execFileSync(
    process.execPath,
    [
      'node_modules/nuxt/bin/nuxt.mjs',
      'build',
      '--dotenv',
      resolve('tests/support/empty.env'),
      '--extends',
      resolve('tests/build'),
    ],
    { env, stdio: 'inherit', windowsHide: true },
  )
  if (sourceFingerprint() !== fingerprint) throw new Error('构建期间源文件变化，不能生成验收凭据')
  const output = resolve('tmp/r1-test/build/public')
  writeFileSync(
    receipt,
    JSON.stringify(
      {
        status: 'completed',
        fingerprint,
        output,
        markers: [...Object.values(markers), 'formula-ai-private-check-20261020'],
        files: publicBuildFiles(output),
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
  execFileSync(process.execPath, ['--import=tsx', '--test', 'tests/private-config.test.mjs'], {
    env: { ...env, FORMULA_TEST_BUILD_RECEIPT: receipt },
    stdio: 'inherit',
    windowsHide: true,
  })
} catch {
  writeFileSync(receipt, JSON.stringify({ status: 'failed', failedAt: new Date().toISOString() }))
  console.error('隔离构建或产物校验失败；不得将旧产物或跳过结果视为通过')
  process.exitCode = 1
}
