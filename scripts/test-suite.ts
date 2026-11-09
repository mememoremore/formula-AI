import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { nodeInfrastructureFiles } from '../tests/support/unit-files'
import { cleanTestProcessEnvironment } from '../tests/support/test-runtime.ts'

const suites: Record<string, { files: string[]; integration: boolean }> = {
  unit: { files: nodeInfrastructureFiles, integration: false },
  protocols: {
    files: ['tests/inference.test.ts', 'tests/recognition.test.ts'],
    integration: false,
  },
  documents: {
    files: ['tests/documents.test.ts', 'tests/moxi-documents.test.ts'],
    integration: false,
  },
  integration: {
    files: [
      'tests/isolation.test.ts',
      'tests/metrics-api.test.ts',
      'tests/resources.test.ts',
      'tests/api.test.mjs',
      'tests/database.test.ts',
      'tests/auth.test.ts',
      'tests/registration.test.ts',
      'tests/library.test.ts',
      'tests/manual-formula-api.test.ts',
      'tests/explanation-api.test.ts',
      'tests/profile-api.test.ts',
      'tests/workspace.test.ts',
      'tests/jobs.test.ts',
      'tests/task-recovery.test.ts',
      'tests/chat-governance.test.ts',
      'tests/lease-recovery.test.ts',
    ],
    integration: true,
  },
}
for (const [name, file] of Object.entries({
  api: 'api.test.mjs',
  db: 'database.test.ts',
  auth: 'auth.test.ts',
  library: 'library.test.ts',
  profile: 'profile-api.test.ts',
  workspace: 'workspace.test.ts',
  jobs: 'jobs.test.ts',
  resources: 'resources.test.ts',
  recovery: 'task-recovery.test.ts',
  chat: 'chat-governance.test.ts',
  'lease-recovery': 'lease-recovery.test.ts',
}))
  suites[name] = { files: [`tests/${file}`], integration: true }

try {
  const suite = suites[process.argv[2] ?? '']
  if (!suite) throw new Error('必须选择已登记的测试组；不接受任意脚本或默认开发目标')
  if (suite.integration) await import('../tests/support/integration.ts')
  // 集成守卫应用后的变量必须传入子进程；纯测试不继承任何服务凭据。
  const env = suite.integration ? { ...process.env } : cleanTestProcessEnvironment()
  delete env.NODE_OPTIONS
  env.DOTENV_CONFIG_PATH = resolve('tests/support/empty.env')
  env.DOTENV_CONFIG_OVERRIDE = 'false'
  const args = ['--import=tsx']
  if (!suite.integration)
    args.push(`--import=${pathToFileURL(resolve('tests/support/unit-safety.ts')).href}`)
  args.push('--test', '--test-concurrency=1', ...suite.files)
  const child = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true })
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => child.kill(signal))
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
  if (code === 0 && process.argv[2] === 'unit') {
    const vitest = spawn(
      process.execPath,
      [
        '--import=tsx',
        'scripts/test-vitest.ts',
        process.argv[3] === 'coverage' ? 'coverage' : 'run',
      ],
      { env, stdio: 'inherit', windowsHide: true },
    )
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
      process.once(signal, () => vitest.kill(signal))
    process.exitCode = await new Promise<number>((resolve, reject) => {
      vitest.once('error', reject)
      vitest.once('exit', (code) => resolve(code ?? 1))
    })
  } else process.exitCode = code
} catch (error) {
  console.error(error instanceof Error ? error.message : '测试启动失败')
  process.exitCode = 1
}
