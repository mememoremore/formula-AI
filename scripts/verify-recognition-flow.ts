import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import sharp from 'sharp'
import { createAuthentication } from '../server/auth/config'
import { createDatabaseClient } from '../server/database/client'
import { createObjectStore } from '../server/storage/object-store'
import { createQueueClient, queues } from '../server/queue/client'
import type { RecognitionTaskState } from '../shared/types/tasks'
import type { UploadedImage } from '../shared/types/workspace'

/** 真实上传与后台识别验收；只创建临时账号，退出时清理本套数据。 */
const db = createDatabaseClient(process.env.NUXT_DATABASE_URL ?? '')
const boss = createQueueClient(process.env.NUXT_DATABASE_URL ?? '')
const store = createObjectStore({
  endpoint: process.env.NUXT_STORAGE_ENDPOINT ?? '',
  region: process.env.NUXT_STORAGE_REGION ?? 'us-east-1',
  bucket: process.env.NUXT_STORAGE_BUCKET ?? '',
  accessKeyId: process.env.NUXT_STORAGE_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.NUXT_STORAGE_SECRET_ACCESS_KEY ?? '',
})
const base = process.env.NUXT_AUTH_BASE_URL ?? 'http://127.0.0.1:3000'
let ownerId = ''
let stage = '初始化'
try {
  assert.equal(process.env.NUXT_RECOGNITION_PROVIDER, 'python', '需要显式Python模式')
  await boss.start()
  const auth = createAuthentication(db, {
    baseURL: base,
    secret: process.env.NUXT_AUTH_SECRET ?? '',
    isDevelopment: true,
  })
  const account = await auth.api.signUpEmail({
    body: {
      name: 'Python识别联调临时账号',
      email: `recognition-${randomUUID()}@formula.test`,
      password: randomBytes(24).toString('base64url'),
    },
    returnHeaders: true,
  })
  ownerId = account.response.user.id
  const cookie = account.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="220"><rect width="100%" height="100%" fill="white"/><text x="80" y="145" font-family="Times New Roman" font-size="100" fill="black">x + 1 = 2</text></svg>'
  const image = await sharp(Buffer.from(svg)).png().toBuffer()
  await mkdir('artifacts', { recursive: true })
  await writeFile('artifacts/recognition-printed-sample.png', image)
  stage = '账号真实上传'
  const upload = await fetch(`${base}/api/account/files`, {
    method: 'POST',
    headers: {
      cookie,
      origin: base,
      'content-type': 'image/png',
      'x-file-name': encodeURIComponent('真实识别联调.png'),
      'x-upload-key': randomUUID(),
    },
    body: new Uint8Array(image),
    signal: AbortSignal.timeout(15_000),
  })
  assert.equal(upload.status, 200)
  const uploaded = (await upload.json()) as { image: UploadedImage }
  stage = '提交识别队列'
  const started = Date.now()
  const response = await fetch(`${base}/api/account/recognitions`, {
    method: 'POST',
    headers: { cookie, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ fileId: uploaded.image.id, mode: 'printed', requestKey: randomUUID() }),
    signal: AbortSignal.timeout(15_000),
  })
  assert.equal(response.status, 202)
  let task = (await response.json()) as RecognitionTaskState
  stage = '等待真实Worker识别并保存'
  while (!['COMPLETED', 'FAILED'].includes(task.status) && Date.now() - started < 120_000) {
    await delay(500)
    const status = await fetch(`${base}/api/account/tasks/${task.id}`, {
      headers: { cookie },
      signal: AbortSignal.timeout(10_000),
    })
    assert.equal(status.status, 200)
    task = (await status.json()) as RecognitionTaskState
  }
  assert.equal(task.status, 'COMPLETED', task.errorMessage ?? '任务未完成')
  assert.equal(task.isMock, false)
  const persisted = await db.recognitionTask.findUniqueOrThrow({
    where: { id: task.id },
    include: { formula: { include: { versions: true } } },
  })
  const version = persisted.formula?.versions[0]
  assert.ok(version)
  assert.equal(version.isMock, false)
  assert.equal(version.latex.replace(/\s/g, ''), 'x+1=2', '已知印刷公式应识别为预期LaTeX')
  assert.match(version.modelVersion ?? '', /^PP-FormulaNet_plus-L@/)
  const refreshed = await fetch(`${base}/api/account/tasks/${task.id}`, {
    headers: { cookie },
    signal: AbortSignal.timeout(10_000),
  })
  assert.equal(((await refreshed.json()) as RecognitionTaskState).formulaId, task.formulaId)
  const evidence = {
    checkedAt: new Date().toISOString(),
    status: task.status,
    attempts: task.attemptCount,
    isMock: version.isMock,
    latex: version.latex,
    modelVersion: version.modelVersion,
    elapsedMs: Date.now() - started,
    savedVersions: persisted.formula?.versions.length,
    expectedFormula: 'x + 1 = 2',
    queueAndPersistenceVerified: true,
    refreshVerified: true,
    fixtureCleanup: true,
  }
  await writeFile(
    'artifacts/recognition-flow-verification.json',
    `${JSON.stringify(evidence, null, 2)}\n`,
  )
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  console.error(
    JSON.stringify({
      stage,
      errorType: error instanceof Error ? error.name : 'Error',
      message:
        error instanceof assert.AssertionError
          ? error.message
          : '联调未完成，未输出原始异常或凭据。',
    }),
  )
  process.exitCode = 1
} finally {
  try {
    if (ownerId) {
      const jobs = await boss.findJobs(queues.recognition, { data: { ownerId }, limit: 100 })
      if (jobs.length)
        await boss.deleteJob(
          queues.recognition,
          jobs.map((job) => job.id),
        )
      const files = await db.storedFile.findMany({
        where: { ownerId },
        select: { objectKey: true },
      })
      for (const file of files) await store.remove(file.objectKey)
      await db.user.delete({ where: { id: ownerId } })
    }
  } finally {
    await boss.stop()
    await db.$disconnect()
  }
}
