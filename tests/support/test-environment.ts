import { createHash } from 'node:crypto'

/** 这是测试资源协议，不是生产环境配置。固定端口避免意外使用开发默认值。 */
export interface TestEnvironment {
  version: 1
  purpose: 'formula-ai-r1'
  runId: string
  project: string
  token: string
  apiUrl: string
  databaseUrl: string
  authSecret: string
  storage: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string }
  containers: { postgres: string; storage: string }
}

function reject(message: string): never {
  // 不把配置原值、URL 中的密码或 Docker inspect 输出放进错误。
  throw new Error(`测试安全检查拒绝执行：${message}`)
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function validateTestEnvironment(value: unknown, requireContainers = true): TestEnvironment {
  if (!record(value) || value.version !== 1 || value.purpose !== 'formula-ai-r1')
    reject('缺少专用测试清单')
  if (
    !text(value.runId) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.runId)
  )
    reject('运行编号无效')
  const suffix = value.runId.replaceAll('-', '').slice(0, 12)
  if (
    value.project !== `formula-ai-r1-${suffix}` ||
    !text(value.token) ||
    !/^[a-f0-9]{64}$/.test(value.token)
  )
    reject('运行身份无效')
  if (value.apiUrl !== 'http://127.0.0.1:3100') reject('API 必须使用专用回环端口')
  if (!text(value.databaseUrl)) reject('缺少测试数据库')
  let db: URL
  try {
    db = new URL(value.databaseUrl)
  } catch {
    return reject('数据库地址无效')
  }
  if (
    db.protocol !== 'postgresql:' ||
    db.hostname !== '127.0.0.1' ||
    db.port !== '15432' ||
    db.username !== 'formula_test' ||
    db.pathname !== `/formula_test_${suffix}` ||
    !/^[a-f0-9]{64}$/.test(db.password) ||
    db.search ||
    db.hash
  )
    reject('数据库目标不属于本次测试运行')
  if (!text(value.authSecret) || !/^[a-f0-9]{64}$/.test(value.authSecret))
    reject('测试认证凭据无效')
  if (
    !record(value.storage) ||
    value.storage.endpoint !== 'http://127.0.0.1:18333' ||
    value.storage.bucket !== `formula-test-${suffix}` ||
    !text(value.storage.accessKeyId) ||
    !/^[a-f0-9]{32}$/.test(value.storage.accessKeyId) ||
    !text(value.storage.secretAccessKey) ||
    !/^[a-f0-9]{64}$/.test(value.storage.secretAccessKey)
  )
    reject('存储目标不属于本次测试运行')
  if (
    !record(value.containers) ||
    !text(value.containers.postgres) ||
    !text(value.containers.storage)
  ) {
    if (requireContainers) reject('容器身份尚未登记')
    if (
      !record(value.containers) ||
      value.containers.postgres !== '' ||
      value.containers.storage !== ''
    )
      reject('容器清单无效')
  } else if (
    !/^[a-f0-9]{64}$/.test(value.containers.postgres) ||
    !/^[a-f0-9]{64}$/.test(value.containers.storage)
  )
    reject('容器编号无效')
  return value as unknown as TestEnvironment
}

export function testVariables(config: TestEnvironment): Record<string, string> {
  return {
    NUXT_DATABASE_URL: config.databaseUrl,
    NUXT_AUTH_SECRET: config.authSecret,
    NUXT_AUTH_BASE_URL: config.apiUrl,
    NUXT_STORAGE_ENDPOINT: config.storage.endpoint,
    NUXT_STORAGE_REGION: 'us-east-1',
    NUXT_STORAGE_BUCKET: config.storage.bucket,
    NUXT_STORAGE_ACCESS_KEY_ID: config.storage.accessKeyId,
    NUXT_STORAGE_SECRET_ACCESS_KEY: config.storage.secretAccessKey,
    NUXT_AI_PROVIDER: 'mock',
    NUXT_AI_API_KEY: 'formula-ai-private-ai-check-day13',
    NUXT_AI_BASE_URL: config.apiUrl + '/disabled-model',
    NUXT_AI_MODEL: 'fixture-model',
    NUXT_RECOGNITION_PROVIDER: 'mock',
    NUXT_RECOGNITION_SERVICE_URL: '',
    NUXT_RECOGNITION_API_KEY: 'formula-ai-private-check-20261020',
    TEST_BASE_URL: config.apiUrl,
    BASE_URL: config.apiUrl,
    NUXT_TELEMETRY_DISABLED: '1',
  }
}

export function assertEnvironmentAgreement(config: TestEnvironment, env: NodeJS.ProcessEnv) {
  const expected = testVariables(config)
  for (const [inputKey, value] of Object.entries(env)) {
    const key = inputKey.toUpperCase()
    if (value === undefined) continue
    if (
      (key.startsWith('NUXT_') || key === 'BASE_URL' || key === 'TEST_BASE_URL') &&
      value !== expected[key]
    )
      reject(`环境变量冲突：${key}`)
    if (/^(PG|AWS_|OPENAI_|DEEPSEEK_|RECOGNITION_)/.test(key) || key === 'DATABASE_URL')
      reject(`不允许隐式资源配置：${key}`)
  }
}

export function environmentFingerprint(config: TestEnvironment) {
  return createHash('sha256')
    .update(JSON.stringify({ runId: config.runId, variables: testVariables(config) }))
    .digest('hex')
}

/** inspect 仅查询 Docker 元数据，不连接数据库、存储或业务 API。 */
export function verifyContainerIdentity(
  config: TestEnvironment,
  kind: 'postgres' | 'storage',
  input: unknown,
  purpose: 'running' | 'cleanup' = 'running',
) {
  if (
    !record(input) ||
    input.Id !== config.containers[kind] ||
    !record(input.Config) ||
    !record(input.Config.Labels) ||
    !record(input.HostConfig) ||
    !record(input.State) ||
    (purpose === 'running' && input.State.Running !== true)
  )
    reject(`${kind} 容器身份不一致或未运行`)
  const labels = input.Config.Labels
  if (
    labels['com.docker.compose.project'] !== config.project ||
    labels['com.docker.compose.service'] !== kind ||
    labels['io.formula-ai.test-run'] !== config.runId ||
    labels['io.formula-ai.test-fingerprint'] !== environmentFingerprint(config)
  )
    reject(`${kind} 容器标签不一致`)
  const port = kind === 'postgres' ? '5432/tcp' : '8333/tcp'
  const hostPort = kind === 'postgres' ? '15432' : '18333'
  const bindings = input.HostConfig.PortBindings
  if (
    !record(bindings) ||
    !Array.isArray(bindings[port]) ||
    bindings[port].length !== 1 ||
    bindings[port][0]?.HostIp !== '127.0.0.1' ||
    bindings[port][0]?.HostPort !== hostPort
  )
    reject(`${kind} 端口映射不一致`)
  if (
    !Array.isArray(input.Mounts) ||
    input.Mounts.some((mount: unknown) => !record(mount) || mount.Type !== 'tmpfs')
  )
    reject(`${kind} 不允许挂载已有磁盘数据`)
  const vars = Object.fromEntries(
    (Array.isArray(input.Config.Env) ? input.Config.Env : []).map((entry: string) => {
      const index = entry.indexOf('=')
      return [entry.slice(0, index), entry.slice(index + 1)]
    }),
  )
  const db = new URL(config.databaseUrl)
  const expected =
    kind === 'postgres'
      ? {
          POSTGRES_USER: db.username,
          POSTGRES_PASSWORD: db.password,
          POSTGRES_DB: db.pathname.slice(1),
        }
      : {
          AWS_ACCESS_KEY_ID: config.storage.accessKeyId,
          AWS_SECRET_ACCESS_KEY: config.storage.secretAccessKey,
          S3_BUCKET: config.storage.bucket,
        }
  for (const [key, value] of Object.entries(expected))
    if (vars[key] !== value) reject(`${kind} 配置身份不一致`)
}

export interface TestApiIdentity {
  runId: string
  fingerprint: string
  providers: { chat: 'mock'; recognition: 'mock' }
}
export function verifyApiIdentity(config: TestEnvironment, value: unknown) {
  if (
    !record(value) ||
    value.runId !== config.runId ||
    value.fingerprint !== environmentFingerprint(config) ||
    !record(value.providers) ||
    value.providers.chat !== 'mock' ||
    value.providers.recognition !== 'mock'
  )
    reject('API 与测试资源身份不一致')
}

/** 注入核对操作，使拒绝行为可在完全不访问真实资源的条件下测试。 */
export async function verifyTestTargets(
  raw: unknown,
  env: NodeJS.ProcessEnv,
  inspect: (id: string) => unknown,
  readIdentity: (config: TestEnvironment) => Promise<unknown>,
) {
  const config = validateTestEnvironment(raw)
  assertEnvironmentAgreement(config, env)
  for (const kind of ['postgres', 'storage'] as const)
    verifyContainerIdentity(config, kind, inspect(config.containers[kind]))
  verifyApiIdentity(config, await readIdentity(config))
  return config
}
