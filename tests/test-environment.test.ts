import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Socket } from 'node:net'
import {
  validateTestEnvironment,
  testVariables,
  assertEnvironmentAgreement,
  environmentFingerprint,
  verifyTestTargets,
  type TestEnvironment,
} from './support/test-environment.ts'
import { installTestNetworkGuard, isNuxtDevelopmentIpc } from './support/network-guard.ts'

function fixture(): TestEnvironment {
  const runId = '12345678-1234-4123-8123-123456789abc'
  return {
    version: 1,
    purpose: 'formula-ai-r1',
    runId,
    project: 'formula-ai-r1-123456781234',
    token: 'a'.repeat(64),
    apiUrl: 'http://127.0.0.1:3100',
    databaseUrl: `postgresql://formula_test:${'b'.repeat(64)}@127.0.0.1:15432/formula_test_123456781234`,
    authSecret: 'c'.repeat(64),
    storage: {
      endpoint: 'http://127.0.0.1:18333',
      bucket: 'formula-test-123456781234',
      accessKeyId: 'd'.repeat(32),
      secretAccessKey: 'e'.repeat(64),
    },
    containers: { postgres: '1'.repeat(64), storage: '2'.repeat(64) },
  }
}
function container(config: TestEnvironment, kind: 'postgres' | 'storage') {
  const db = new URL(config.databaseUrl)
  return {
    Id: config.containers[kind],
    State: { Running: true },
    Config: {
      Labels: {
        'com.docker.compose.project': config.project,
        'com.docker.compose.service': kind,
        'io.formula-ai.test-run': config.runId,
        'io.formula-ai.test-fingerprint': environmentFingerprint(config),
      },
      Env:
        kind === 'postgres'
          ? [
              `POSTGRES_USER=${db.username}`,
              `POSTGRES_PASSWORD=${db.password}`,
              `POSTGRES_DB=${db.pathname.slice(1)}`,
            ]
          : [
              `AWS_ACCESS_KEY_ID=${config.storage.accessKeyId}`,
              `AWS_SECRET_ACCESS_KEY=${config.storage.secretAccessKey}`,
              `S3_BUCKET=${config.storage.bucket}`,
            ],
    },
    HostConfig: {
      PortBindings:
        kind === 'postgres'
          ? { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '15432' }] }
          : { '8333/tcp': [{ HostIp: '127.0.0.1', HostPort: '18333' }] },
    },
    Mounts: [{ Type: 'tmpfs' }],
  }
}

test('完整受控身份通过；核对顺序为容器再 API，未调用资源写入', async () => {
  const config = fixture(),
    effects: string[] = []
  const verified = await verifyTestTargets(
    config,
    {},
    (id) => {
      effects.push('inspect')
      return container(config, id === config.containers.postgres ? 'postgres' : 'storage')
    },
    async () => {
      effects.push('identity')
      return {
        runId: config.runId,
        fingerprint: environmentFingerprint(config),
        providers: { chat: 'mock', recognition: 'mock' },
      }
    },
  )
  assert.equal(verified, config)
  assert.deepEqual(effects, ['inspect', 'inspect', 'identity'])
})

for (const [name, change] of [
  ['缺失清单', () => undefined],
  ['开发 API', (c: TestEnvironment) => ({ ...c, apiUrl: 'http://127.0.0.1:3000' })],
  [
    '开发数据库',
    (c: TestEnvironment) => ({ ...c, databaseUrl: c.databaseUrl.replace(':15432/', ':5432/') }),
  ],
  [
    '公网数据库',
    (c: TestEnvironment) => ({
      ...c,
      databaseUrl: c.databaseUrl.replace('127.0.0.1', 'db.example.test'),
    }),
  ],
  [
    '仅含 test 的数据库名称',
    (c: TestEnvironment) => ({
      ...c,
      databaseUrl: c.databaseUrl.replace('formula_test_123456781234', 'test'),
    }),
  ],
  [
    '开发存储',
    (c: TestEnvironment) => ({
      ...c,
      storage: { ...c.storage, endpoint: 'http://127.0.0.1:8333' },
    }),
  ],
  [
    '其他桶',
    (c: TestEnvironment) => ({ ...c, storage: { ...c.storage, bucket: 'formula-private' } }),
  ],
  ['未登记容器', (c: TestEnvironment) => ({ ...c, containers: { postgres: '', storage: '' } })],
] as const)
  test(`${name}在任何核对或连接前拒绝`, async () => {
    let effects = 0
    await assert.rejects(
      verifyTestTargets(
        change(fixture()),
        {},
        () => {
          effects++
          throw new Error('不得执行')
        },
        async () => {
          effects++
          return {}
        },
      ),
      /测试安全检查/,
    )
    assert.equal(effects, 0)
  })

for (const env of [
  { NUXT_AI_PROVIDER: 'deepseek' },
  { NUXT_RECOGNITION_PROVIDER: 'python' },
  { NUXT_DATABASE_URL: 'postgresql://secret-do-not-print@127.0.0.1:5432/dev' },
  { TEST_BASE_URL: 'http://127.0.0.1:3000' },
  { AWS_ENDPOINT_URL: 'http://127.0.0.1:8333' },
])
  test(`冲突变量 ${Object.keys(env)[0]} 在副作用前拒绝且不打印原值`, async () => {
    let effects = 0
    await assert.rejects(
      verifyTestTargets(
        fixture(),
        env,
        () => {
          effects++
          return {}
        },
        async () => {
          effects++
          return {}
        },
      ),
      (error) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /测试安全检查/)
        assert.ok(!error.message.includes('secret-do-not-print'))
        return true
      },
    )
    assert.equal(effects, 0)
  })

test('相同测试名不足以证明安全：容器运行身份不符时不访问 API', async () => {
  const config = fixture()
  let apiCalls = 0
  await assert.rejects(
    verifyTestTargets(
      config,
      {},
      () => ({ ...container(config, 'postgres'), Id: '9'.repeat(64) }),
      async () => {
        apiCalls++
        return {}
      },
    ),
    /容器身份/,
  )
  assert.equal(apiCalls, 0)
})
test('已有磁盘数据挂载被拒绝', async () => {
  const config = fixture()
  await assert.rejects(
    verifyTestTargets(
      config,
      {},
      () => ({ ...container(config, 'postgres'), Mounts: [{ Type: 'volume' }] }),
      async () => ({}),
    ),
    /已有磁盘数据/,
  )
})
test('API 未使用同一资源或未禁用模型时拒绝，不进入测试', async () => {
  const config = fixture()
  for (const identity of [
    { runId: config.runId, fingerprint: 'other' },
    {
      runId: config.runId,
      fingerprint: environmentFingerprint(config),
      providers: { chat: 'deepseek', recognition: 'mock' },
    },
  ])
    await assert.rejects(
      verifyTestTargets(
        config,
        {},
        (id) => container(config, id === config.containers.postgres ? 'postgres' : 'storage'),
        async () => identity,
      ),
      /API/,
    )
})
test('生成的测试变量可重复验证，外部配置不能覆盖', () => {
  const config = fixture()
  validateTestEnvironment(config)
  assert.doesNotThrow(() => assertEnvironmentAgreement(config, testVariables(config)))
})
test('公网与开发端口在 socket 建连前被拒绝，未连接真实目标', () => {
  installTestNetworkGuard()
  for (const target of [
    { host: 'api.deepseek.com', port: 443 },
    { host: '127.0.0.1', port: 5432 },
    { host: '127.0.0.1', port: 8333 },
  ]) {
    const socket = new Socket()
    assert.throws(() => socket.connect(target), /测试网络策略/)
    assert.equal(socket.connecting, false)
    socket.destroy()
  }
})
test('Nuxt IPC 仅允许框架生成的本机名称，不放开其他命名管道', () => {
  for (const pipe of [
    '\\\\.\\pipe\\nuxt-vite-1234abcd',
    '\\0nitro-worker-1-2-3-4.sock'.replace('\\0', '\0'),
    '/tmp/nuxt-vite-123456/nuxt.sock',
  ])
    assert.equal(isNuxtDevelopmentIpc(pipe), true)
  for (const pipe of [
    '\\\\.\\pipe\\postgresql',
    '/tmp/other/nuxt.sock',
    '/outside/nuxt-vite-123/nuxt.sock',
  ])
    assert.equal(isNuxtDevelopmentIpc(pipe), false)
})
