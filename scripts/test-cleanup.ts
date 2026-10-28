import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cleanupPlan } from '../tests/support/cleanup-plan.ts'
import {
  assertLocalDocker,
  inspectContainer,
  loadTestManifest,
} from '../tests/support/test-runtime.ts'

export function cleanupEnvironment(manifest: string) {
  const config = loadTestManifest({ ...process.env, FORMULA_TEST_MANIFEST: manifest }, true)
  assertLocalDocker()
  const docker = (args: string[]) =>
    execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: 60_000,
    }).trim()
  const discovered = docker([
    'ps',
    '-aq',
    '--no-trunc',
    '--filter',
    `label=com.docker.compose.project=${config.project}`,
  ])
    .split(/\r?\n/)
    .filter(Boolean)
  const { ids } = cleanupPlan(config, discovered.map(inspectContainer))
  // Registered targets disappearing is safe; a different replacement fails the identity check above.
  for (const id of ids) docker(['rm', '-f', id])
  const networks = docker([
    'network',
    'ls',
    '-q',
    '--filter',
    `label=com.docker.compose.project=${config.project}`,
  ])
    .split(/\r?\n/)
    .filter(Boolean)
  for (const id of networks) {
    const [network] = JSON.parse(docker(['network', 'inspect', id])) as Array<{
      Name: string
      Labels: Record<string, string>
      Containers: Record<string, unknown>
    }>
    if (
      !network ||
      network.Name !== `${config.project}_default` ||
      network.Labels['com.docker.compose.project'] !== config.project ||
      Object.keys(network.Containers).length
    )
      throw new Error('网络清理身份不明确，保留网络供人工核查')
    docker(['network', 'rm', id])
  }
  return ids.length
}

// CI fallback after interruption. A fresh checkout has only this job's manifests.
// Every candidate still passes the same full identity and tmpfs checks.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    let removed = 0
    if (process.env.FORMULA_TEST_MANIFEST) {
      removed += cleanupEnvironment(process.env.FORMULA_TEST_MANIFEST)
    } else if (
      process.env.GITHUB_ACTIONS !== 'true' ||
      !/^\d+$/.test(process.env.GITHUB_RUN_ID ?? '')
    ) {
      throw new Error('本机清理必须显式指定 FORMULA_TEST_MANIFEST，不扫描其他运行')
    } else if (existsSync('tmp/r1-test'))
      for (const directory of readdirSync('tmp/r1-test', { withFileTypes: true })) {
        if (!directory.isDirectory() || !/^[a-f0-9-]{36}$/.test(directory.name)) continue
        const manifest = resolve('tmp/r1-test', directory.name, 'environment.json')
        if (existsSync(manifest)) removed += cleanupEnvironment(manifest)
      }
    console.log(`隔离清理核验完成：${removed} 个专用测试容器`)
  } catch {
    console.error('隔离清理核验失败；保留不确定目标，不执行广域清理')
    process.exitCode = 1
  }
}
