import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import {
  validateTestEnvironment,
  assertEnvironmentAgreement,
  environmentFingerprint,
  type TestEnvironment,
} from '../tests/support/test-environment.ts'
import {
  loadTestManifest,
  inspectTestContainers,
  applyTestVariables,
  isolatedChildEnvironment,
  assertLocalDocker,
  cleanTestProcessEnvironment,
} from '../tests/support/test-runtime.ts'

function run(
  command: string,
  args: string[],
  env = process.env,
  output: 'inherit' | number = 'inherit',
) {
  execFileSync(command, args, { env, stdio: ['ignore', output, output], windowsHide: true })
}
async function portMustBeFree(port: number) {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', () => reject(new Error(`测试端口 ${port} 已被占用；不会复用现有服务`)))
    server.listen(port, '127.0.0.1', () =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  })
}
function composeArguments(config: TestEnvironment, envFile: string) {
  return [
    'compose',
    '--project-name',
    config.project,
    '--env-file',
    envFile,
    '--file',
    resolve('compose.test.yaml'),
  ]
}
export async function createEnvironment(
  onManifest?: (path: string) => number | void,
  afterContainers?: () => void,
) {
  assertLocalDocker()
  try {
    execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
      stdio: 'pipe',
      windowsHide: true,
      timeout: 10_000,
    })
  } catch {
    throw new Error('Docker 引擎不可用；未创建测试环境、未执行迁移或测试')
  }
  for (const port of [3100, 15432, 18333]) await portMustBeFree(port)
  const runId = randomUUID(),
    suffix = runId.replaceAll('-', '').slice(0, 12)
  const secret = () => randomBytes(32).toString('hex')
  const config: TestEnvironment = {
    version: 1,
    purpose: 'formula-ai-r1',
    runId,
    project: `formula-ai-r1-${suffix}`,
    token: secret(),
    apiUrl: 'http://127.0.0.1:3100',
    databaseUrl: `postgresql://formula_test:${secret()}@127.0.0.1:15432/formula_test_${suffix}`,
    authSecret: secret(),
    storage: {
      endpoint: 'http://127.0.0.1:18333',
      bucket: `formula-test-${suffix}`,
      accessKeyId: randomBytes(16).toString('hex'),
      secretAccessKey: secret(),
    },
    containers: { postgres: '', storage: '' },
  }
  validateTestEnvironment(config, false)
  assertEnvironmentAgreement(config, process.env)
  const directory = resolve('tmp/r1-test', runId),
    manifest = resolve(directory, 'environment.json'),
    envFile = resolve(directory, 'compose.env')
  mkdirSync(resolve('tmp/r1-test'), { recursive: true })
  mkdirSync(directory, { mode: 0o700 })
  writeFileSync(manifest, JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 })
  const output = onManifest?.(manifest) ?? 'inherit'
  const db = new URL(config.databaseUrl)
  writeFileSync(
    envFile,
    Object.entries({
      FORMULA_TEST_RUN_ID: runId,
      FORMULA_TEST_FINGERPRINT: environmentFingerprint(config),
      FORMULA_TEST_DB_PASSWORD: db.password,
      FORMULA_TEST_DB_NAME: db.pathname.slice(1),
      FORMULA_TEST_STORAGE_ID: config.storage.accessKeyId,
      FORMULA_TEST_STORAGE_SECRET: config.storage.secretAccessKey,
      FORMULA_TEST_BUCKET: config.storage.bucket,
    })
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
    { flag: 'wx', mode: 0o600 },
  )
  const env = isolatedChildEnvironment(config, manifest)
  run(
    'docker',
    [...composeArguments(config, envFile), 'up', '-d', '--wait', '--wait-timeout', '120'],
    env,
    output,
  )
  for (const kind of ['postgres', 'storage'] as const)
    config.containers[kind] = execFileSync(
      'docker',
      [...composeArguments(config, envFile), 'ps', '-q', kind],
      { env, encoding: 'utf8', windowsHide: true },
    ).trim()
  validateTestEnvironment(config)
  writeFileSync(manifest, JSON.stringify(config, null, 2), { mode: 0o600 })
  inspectTestContainers(config)
  afterContainers?.()
  // 只向刚创建、身份和 tmpfs 挂载均已核对的空测试实例部署既有迁移。
  run(process.execPath, ['node_modules/prisma/build/index.js', 'generate'], env, output)
  // Root tsconfig references .nuxt/tsconfig.*. The API's separate buildDir does not
  // create these; cold checkouts must prepare them explicitly, without any resource credentials.
  const prepareEnv = cleanTestProcessEnvironment()
  prepareEnv.NODE_OPTIONS = `--import=tsx --import=${pathToFileURL(resolve('tests/support/unit-safety.ts')).href}`
  run(
    process.execPath,
    ['node_modules/nuxt/bin/nuxt.mjs', 'prepare', '--dotenv', resolve('tests/support/empty.env')],
    prepareEnv,
    output,
  )
  run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], env, output)
  const queue = await import('../server/queue/client.ts')
  applyTestVariables(config)
  const boss = queue.createQueueClient(config.databaseUrl, { install: true })
  try {
    await boss.start()
    await queue.installQueues(boss)
  } finally {
    await boss.stop()
  }
  if (output === 'inherit')
    console.log(`测试资源就绪。后续命令必须显式设置 FORMULA_TEST_MANIFEST=${manifest}`)
  return manifest
}

export async function launchApi(output: 'inherit' | number = 'inherit') {
  const config = loadTestManifest()
  inspectTestContainers(config)
  await portMustBeFree(3100)
  const env = isolatedChildEnvironment(config, process.env.FORMULA_TEST_MANIFEST!)
  env.CI = '1'
  // Node 24 原生剥离此预加载器的类型；不把 tsx loader 注入 Nuxt 的内部 Worker。
  env.NODE_OPTIONS = `--import=${pathToFileURL(resolve('tests/support/api-safety.ts')).href}`
  const child = spawn(
    process.execPath,
    [
      'node_modules/nuxt/bin/nuxt.mjs',
      'dev',
      '--no-fork',
      '--host',
      '127.0.0.1',
      '--port',
      '3100',
      '--dotenv',
      resolve('tests/support/empty.env'),
      '--extends',
      resolve('tests/runtime'),
    ],
    { env, stdio: ['ignore', output, output], windowsHide: true },
  )
  return child
}

async function startApi() {
  const child = await launchApi()
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => child.kill(signal))
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error('测试 API 已退出'))))
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  try {
    const command = process.argv[2]
    if (command === 'create') await createEnvironment()
    else if (command === 'api') await startApi()
    else if (command === 'worker') {
      await import('../tests/support/integration.ts')
      await import('./worker.ts')
    } else if (command === 'check') {
      await import('../tests/support/integration.ts')
      console.log('测试 API、容器及资源身份全部一致')
    } else if (command === 'stop') {
      const config = loadTestManifest()
      inspectTestContainers(config)
      // 按已核对的容器 ID 停止；不执行 down -v，不读取可被更换的 Compose env 文件。
      run('docker', ['stop', config.containers.postgres, config.containers.storage])
    } else throw new Error('只支持 create、api、worker、check、stop；不会回退到开发环境')
  } catch (error) {
    // 子进程错误可能带有配置输出，不向终端复制其 stdout/stderr 对象。
    console.error(
      error instanceof Error && !('status' in error)
        ? error.message
        : '测试环境操作失败；未继续执行后续步骤',
    )
    process.exitCode = 1
  }
