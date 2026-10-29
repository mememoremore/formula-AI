import { readFileSync, realpathSync } from 'node:fs'
import { resolve, relative, isAbsolute, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  validateTestEnvironment,
  assertEnvironmentAgreement,
  testVariables,
  verifyContainerIdentity,
  type TestEnvironment,
} from './test-environment.ts'

export function loadTestManifest(env: NodeJS.ProcessEnv = process.env, provisioning = false) {
  const file = env.FORMULA_TEST_MANIFEST
  if (!file || !isAbsolute(file))
    throw new Error('测试安全检查拒绝执行：必须显式指定 FORMULA_TEST_MANIFEST')
  const allowed = resolve('tmp/r1-test')
  const rel = relative(allowed, realpathSync(file))
  if (
    rel.startsWith('..') ||
    isAbsolute(rel) ||
    rel.split(sep).length !== 2 ||
    !rel.endsWith(`${sep}environment.json`)
  )
    throw new Error('测试安全检查拒绝执行：清单必须位于专用运行目录')
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new Error('测试安全检查拒绝执行：清单不是有效 JSON')
  }
  const config = validateTestEnvironment(raw, !provisioning)
  if (rel.split(sep)[0] !== config.runId)
    throw new Error('测试安全检查拒绝执行：目录与运行编号不一致')
  assertEnvironmentAgreement(config, env)
  return config
}

export function inspectTestContainers(config: TestEnvironment) {
  assertLocalDocker()
  for (const kind of ['postgres', 'storage'] as const) {
    verifyContainerIdentity(config, kind, inspectContainer(config.containers[kind]))
  }
}

export function inspectContainer(id: string): unknown {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('测试安全检查拒绝执行：容器编号无效')
  try {
    return JSON.parse(
      execFileSync('docker', ['inspect', id], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        timeout: 10_000,
      }),
    )[0]
  } catch {
    throw new Error('测试安全检查拒绝执行：无法核对专用 Docker 容器')
  }
}

export function assertLocalDocker() {
  if (process.env.DOCKER_HOST && !/^(npipe:|unix:)/.test(process.env.DOCKER_HOST))
    throw new Error('测试安全检查拒绝执行：不支持远程 Docker 引擎')
  let endpoint: string
  try {
    endpoint = execFileSync(
      'docker',
      ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        timeout: 10_000,
      },
    ).trim()
  } catch {
    throw new Error('测试安全检查拒绝执行：无法核对 Docker 本机上下文')
  }
  if (!/^(npipe:|unix:)/.test(endpoint))
    throw new Error('测试安全检查拒绝执行：Docker 上下文不是本机管道')
}

export function applyTestVariables(config: TestEnvironment) {
  assertEnvironmentAgreement(config, process.env)
  Object.assign(process.env, testVariables(config), {
    NUXT_TELEMETRY_DISABLED: '1',
    DO_NOT_TRACK: '1',
    // 即使依赖内部加载 dotenv，也不能回退到项目根目录的开发 .env。
    DOTENV_CONFIG_PATH: resolve('tests/support/empty.env'),
    DOTENV_CONFIG_OVERRIDE: 'false',
  })
}

export function cleanTestProcessEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of Object.keys(env))
    if (
      /^(NUXT_|NITRO_|PG|AWS_|DOTENV_|FORMULA_TEST_|FORMULA_RESOURCE_|FORMULA_WORKER_|RECOGNITION_|OPENAI_|DEEPSEEK_|BASE_URL$|TEST_BASE_URL$|DATABASE_URL$|NODE_OPTIONS$)/i.test(
        key,
      )
    )
      delete env[key]
  return {
    ...env,
    DOTENV_CONFIG_PATH: resolve('tests/support/empty.env'),
    DOTENV_CONFIG_OVERRIDE: 'false',
    NUXT_TELEMETRY_DISABLED: '1',
    DO_NOT_TRACK: '1',
  }
}

export function isolatedChildEnvironment(
  config: TestEnvironment,
  manifest: string,
): NodeJS.ProcessEnv {
  return {
    ...cleanTestProcessEnvironment(),
    ...testVariables(config),
    FORMULA_TEST_MANIFEST: manifest,
  }
}
