import { closeSync, mkdirSync, openSync, writeFileSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { createEnvironment, launchApi } from './test-environment.ts'
import { cleanupEnvironment } from './test-cleanup.ts'
import { loadTestManifest, isolatedChildEnvironment } from '../tests/support/test-runtime.ts'
import { verifyApiIdentity } from '../tests/support/test-environment.ts'

const mode = process.argv[2]
const viewport = process.argv[3]
if (viewport && (mode !== 'e2e' || !['320', '390', '430', '1440'].includes(viewport)))
  throw new Error('无效的定向视口')
if (!['integration', 'e2e', 'faults', 'cleanup-proof'].includes(mode ?? ''))
  throw new Error('必须指定隔离测试组')
class ExpectedSetupFailure extends Error {}
const started = Date.now()
let manifest: string | undefined
let setupLog: number | undefined
const children: ChildProcess[] = []
let interrupted = false
let stopping = false
let workerRestarts = 0
let testChild: ChildProcess | undefined
let workerFailed = false
let interrupting: Promise<unknown> | undefined
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    interrupted = true
    interrupting = Promise.allSettled(children.map(stop))
  })
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (child.connected) {
    child.send({ type: 'stop' })
    for (let i = 0; i < 70 && child.exitCode === null && child.signalCode === null; i++)
      await delay(100)
    if (child.exitCode !== null || child.signalCode !== null) return
  }
  if (process.platform === 'win32' && child.pid) {
    // Only a still-owned live child PID; kill its subtree so test/browser grandchildren cannot leak.
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 10000,
      })
    } catch {
      /* confirm exit below */
    }
  } else child.kill('SIGTERM')
  for (let i = 0; i < 100 && child.exitCode === null && child.signalCode === null; i++)
    await delay(100)
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  for (let i = 0; i < 50 && child.exitCode === null && child.signalCode === null; i++)
    await delay(100)
  if (child.exitCode === null && child.signalCode === null) throw new Error('测试子进程停止未确认')
}
try {
  manifest = await createEnvironment(
    (path) => {
      manifest = path
      setupLog = openSync(resolve(dirname(path), 'setup.log'), 'a', 0o600)
      return setupLog
    },
    () => {
      if (mode === 'cleanup-proof') throw new ExpectedSetupFailure()
    },
  )
  process.env.FORMULA_TEST_MANIFEST = manifest
  if (interrupted) throw new Error('隔离创建已中断')
  const config = loadTestManifest()
  const directory = resolve('tmp/r1-test', config.runId)
  const apiLog = openSync(resolve(directory, 'api.log'), 'a', 0o600)
  const api = await launchApi(apiLog)
  closeSync(apiLog)
  children.push(api)
  let ready = false
  for (let i = 0; i < 180; i++) {
    if (interrupted || api.exitCode !== null) throw new Error('API 启动中断')
    try {
      const response = await fetch(`${config.apiUrl}/api/__test/identity`, {
        headers: { 'x-formula-test-token': config.token },
        signal: AbortSignal.timeout(1000),
        redirect: 'error',
      })
      if (response.ok) {
        verifyApiIdentity(config, await response.json())
        ready = true
        break
      }
    } catch {
      /* bounded readiness, never connect to resources until the API proof succeeds */
    }
    await delay(1000)
  }
  if (!ready) throw new Error('隔离 API 身份未确认')
  const env = isolatedChildEnvironment(config, manifest)
  if (mode !== 'integration') {
    const failWorker = () => {
      workerFailed = true
      if (testChild) void stop(testChild).catch(() => {})
    }
    const startWorker = (): Promise<void> => {
      const log = openSync(resolve(directory, 'worker.log'), 'a', 0o600)
      const worker = spawn(process.execPath, ['--import=tsx', 'tests/e2e/worker.ts'], {
        env,
        stdio: ['ignore', log, log, 'ipc'],
        windowsHide: true,
      })
      closeSync(log)
      children.push(worker)
      worker.once('exit', (code) => {
        // Only the explicit controlled crash marker authorizes bounded restart.
        if (stopping || interrupted) return
        if (code === 86 && workerRestarts < 2) {
          workerRestarts++
          void startWorker().catch(failWorker)
        } else failWorker()
      })
      return new Promise<void>((done, reject) => {
        const timeout = setTimeout(() => reject(new Error('受控 Worker 就绪超时')), 30000)
        worker.once('error', () => {
          clearTimeout(timeout)
          reject(new Error('受控 Worker 启动失败'))
        })
        worker.once('exit', () => {
          clearTimeout(timeout)
          reject(new Error('受控 Worker 未就绪即退出'))
        })
        worker.once('message', (message) => {
          clearTimeout(timeout)
          if (
            message &&
            typeof message === 'object' &&
            'type' in message &&
            message.type === 'ready' &&
            'runId' in message &&
            message.runId === config.runId
          )
            done()
          else reject(new Error('受控 Worker 运行身份不一致'))
        })
      })
    }
    await startWorker()
  }
  const logPath = resolve(directory, `${mode}.log`)
  const fd = openSync(logPath, 'a', 0o600)
  const args =
    mode === 'integration'
      ? ['--import=tsx', 'scripts/test-suite.ts', 'integration']
      : [
          'node_modules/playwright/cli.js',
          'test',
          '--config=tests/e2e/playwright.config.ts',
          ...(mode === 'faults' ? ['--grep=@fault'] : ['--grep-invert=@fault']),
          ...(viewport ? [`--grep=${viewport}px`] : []),
        ]
  const child = spawn(process.execPath, args, { env, stdio: ['ignore', fd, fd], windowsHide: true })
  closeSync(fd)
  children.push(child)
  testChild = child
  const code = await new Promise<number>((done, reject) => {
    child.once('error', reject)
    child.once('exit', (value) => done(value ?? 1))
  })
  process.exitCode = workerFailed ? 1 : code
  console.log(
    `R16 ${mode}: exit=${process.exitCode}, ${Math.round((Date.now() - started) / 1000)}s; 私有日志已保存`,
  )
} catch (error) {
  if (error instanceof ExpectedSetupFailure) {
    console.log('预期的创建中断已注入：数据库迁移/API/队列尚未启动')
    process.exitCode = 0
  } else {
    console.error('R16 隔离执行失败；详细日志仅保存在本机 tmp，未回退开发资源')
    process.exitCode = 1
  }
} finally {
  stopping = true
  if (setupLog !== undefined) closeSync(setupLog)
  await interrupting
  let cleanup: 'verified' | 'unconfirmed' | 'not-created' = 'not-created'
  try {
    for (const child of children.reverse()) await stop(child)
    if (manifest) console.log(`测试容器清理：${cleanupEnvironment(manifest)} 个，未操作开发资源`)
    cleanup = manifest ? 'verified' : 'not-created'
  } catch {
    cleanup = 'unconfirmed'
    console.error('隔离清理未确认：保留 manifest，需核查本次运行标识；禁止广域清理')
    process.exitCode = 1
  }
  if (manifest) {
    const artifacts = resolve('tmp/r16-artifacts', basename(dirname(manifest)))
    mkdirSync(artifacts, { recursive: true })
    // No error/URL/headers/env/credential fields. Cleanup failure cannot publish a passing receipt.
    writeFileSync(
      resolve(artifacts, 'summary.json'),
      JSON.stringify({
        group: mode,
        viewport: viewport ? Number(viewport) : null,
        exitCode: Number(process.exitCode ?? 1),
        cleanup,
        workerRestarts,
        durationMs: Date.now() - started,
      }),
    )
  }
}
