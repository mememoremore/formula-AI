import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { before, after, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import sharp from 'sharp'
import { createAuthentication } from '../server/auth/config'
import { createDatabaseClient } from '../server/database/client'
import { createObjectStore } from '../server/storage/object-store'
import { uploadPrivateImage } from '../server/services/image-upload'
import { createFormula } from '../server/database/formulas'
import type { RecognitionTaskState } from '../shared/types/tasks'
import { createQueueClient, queues } from '../server/queue/client'
import type {
  UploadedImage,
  SavedFormula,
  SavedRecognition,
  FormulaHistoryPage,
} from '../shared/types/workspace'

const baseURL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000'
const origin = process.env.NUXT_AUTH_BASE_URL ?? baseURL
const db = createDatabaseClient(process.env.NUXT_DATABASE_URL ?? '')
const store = createObjectStore({
  endpoint: process.env.NUXT_STORAGE_ENDPOINT ?? '',
  region: process.env.NUXT_STORAGE_REGION ?? 'us-east-1',
  bucket: process.env.NUXT_STORAGE_BUCKET ?? '',
  accessKeyId: process.env.NUXT_STORAGE_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.NUXT_STORAGE_SECRET_ACCESS_KEY ?? '',
})
const suffix = randomUUID()
const emails = [`workspace-a-${suffix}@formula.test`, `workspace-b-${suffix}@formula.test`]
const password = `Fixture-${randomBytes(24).toString('base64url')}`
const testOwners: string[] = []
let cookieA = ''
let cookieB = ''
let png: Buffer
let rotatedJpeg: Buffer
let tooManyPixels: Buffer
let imageA: UploadedImage
let imageB: UploadedImage
let recognitionA: SavedRecognition
let foreignFormulaId = ''
let original: SavedFormula
const uploadKey = randomUUID()

async function api(
  path: string,
  cookie = cookieA,
  body?: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
) {
  const response = await fetch(`${baseURL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      cookie,
      origin,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
  // Day8 以后接口返回异步任务；这套历史业务回归等待完成，HTTP 202 与排队另由 jobs.test 验证。
  if (path === '/api/account/recognitions' && body && response.status === 202) {
    let task = (await response.json()) as RecognitionTaskState
    for (let attempt = 0; attempt < 100; attempt++) {
      if (task.status === 'COMPLETED')
        return new Response(
          JSON.stringify({ taskId: task.id, formulaId: task.formulaId, isMock: task.isMock }),
          { status: 200 },
        )
      if (task.status === 'FAILED') throw new Error(task.errorMessage ?? '识别任务失败。')
      await delay(100)
      const status = await fetch(`${baseURL}/api/account/tasks/${task.id}`, { headers: { cookie } })
      assert.equal(status.status, 200)
      task = (await status.json()) as RecognitionTaskState
    }
    throw new Error('等待 Worker 超时，请先运行 npm run worker。')
  }
  return response
}
async function upload(
  data: Buffer,
  key = randomUUID(),
  cookie = cookieA,
  mime = 'image/png',
  name = '公式.png',
) {
  return fetch(`${baseURL}/api/account/files`, {
    method: 'POST',
    headers: {
      origin,
      cookie,
      'content-type': mime,
      'x-file-name': encodeURIComponent(name),
      'x-upload-key': key,
    },
    body: new Uint8Array(data),
  })
}
async function registerFixture(email: string) {
  // 认证库的服务端注册用于隔离本套业务测试与 HTTP 注册限流；HTTP 注册另有独立验收。
  const auth = createAuthentication(db, {
    baseURL: origin,
    secret: process.env.NUXT_AUTH_SECRET ?? '',
    isDevelopment: false,
  })
  const result = await auth.api.signUpEmail({
    body: { email, password, name: '上传业务临时用户' },
    returnHeaders: true,
  })
  testOwners.push(result.response.user.id)
  return result.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
}

before(async () => {
  await db.$connect()
  await store.check()
  cookieA = await registerFixture(emails[0]!)
  cookieB = await registerFixture(emails[1]!)
  png = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer()
  rotatedJpeg = await sharp({
    create: { width: 40, height: 20, channels: 3, background: '#f0f0ff' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  // 提前生成大尺寸样例，避免测试间长时间 CPU 编码造成 HTTP 空闲连接复用竞争。
  tooManyPixels = await sharp({
    create: { width: 5001, height: 4000, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer()
  const browserFixture = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="400"><rect width="100%" height="100%" fill="white"/><text x="100" y="240" font-family="serif" font-size="100" fill="#252438">x² + y² = z²</text></svg>',
    ),
  )
    .png()
    .toBuffer()
  await writeFile('artifacts/day56-fixture.png', browserFixture)
})
after(async () => {
  try {
    const queue = createQueueClient(process.env.NUXT_DATABASE_URL ?? '')
    try {
      await queue.start()
      for (const name of Object.values(queues))
        for (const ownerId of testOwners) {
          const jobs = await queue.findJobs(name, { data: { ownerId } })
          if (jobs.length)
            await queue.deleteJob(
              name,
              jobs.map((job) => job.id),
            )
        }
    } finally {
      await queue.stop()
    }
    const files = await db.storedFile.findMany({
      where: { ownerId: { in: testOwners } },
      select: { bucket: true, objectKey: true },
    })
    for (const file of files) if (file.bucket === store.bucket) await store.remove(file.objectKey)
    await db.user.deleteMany({ where: { email: { in: emails } } })
  } finally {
    await db.$disconnect()
  }
})

test('真实 PNG 上传到私有对象存储，数据库只在成功后标记 READY', async () => {
  const response = await upload(png, uploadKey)
  assert.equal(response.status, 200)
  imageA = ((await response.json()) as { image: UploadedImage }).image
  assert.equal(imageA.width, 40)
  const file = await db.storedFile.findUniqueOrThrow({ where: { id: imageA.id } })
  assert.equal(file.status, 'READY')
  assert.equal(file.ownerId, testOwners[0])
  assert.equal(file.contentHash?.length, 64)
  const stored = await store.get(file.objectKey)
  assert.equal((await sharp(stored).metadata()).format, 'png')
  assert.equal(stored.length, imageA.sizeBytes)
})

test('JPEG 在服务端完整解码、按 EXIF 校正方向并移除元数据', async () => {
  const response = await upload(rotatedJpeg, randomUUID(), cookieB, 'image/jpeg', '相机照片.jpg')
  assert.equal(response.status, 200)
  imageB = ((await response.json()) as { image: UploadedImage }).image
  assert.equal(imageB.width, 20)
  assert.equal(imageB.height, 40)
  const file = await db.storedFile.findUniqueOrThrow({ where: { id: imageB.id } })
  const metadata = await sharp(await store.get(file.objectKey)).metadata()
  assert.equal(metadata.orientation, undefined)
  assert.equal(metadata.exif, undefined)
})

test('服务器拒绝伪装格式、损坏数据、空内容和超过 10MB 的实际字节', async () => {
  assert.equal((await upload(png, randomUUID(), cookieA, 'image/jpeg')).status, 415)
  assert.equal((await upload(Buffer.from('<svg/>'))).status, 415)
  assert.equal((await upload(png.subarray(0, 24))).status, 400)
  assert.equal((await upload(Buffer.alloc(0))).status, 400)
  assert.equal((await upload(Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413)
})

test('无 Content-Length 的分块请求同样受实际字节限制', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(6 * 1024 * 1024))
      controller.enqueue(new Uint8Array(5 * 1024 * 1024))
      controller.close()
    },
  })
  const response = await fetch(`${baseURL}/api/account/files`, {
    method: 'POST',
    duplex: 'half',
    body,
    headers: {
      origin,
      cookie: cookieA,
      'content-type': 'image/png',
      'x-file-name': 'oversize.png',
      'x-upload-key': randomUUID(),
    },
  } as RequestInit & { duplex: 'half' })
  assert.equal(response.status, 413)
})

test('服务器拒绝解码后超过 2000 万像素的压缩小图片', async () => {
  assert.equal(tooManyPixels.length < 10 * 1024 * 1024, true)
  assert.equal((await upload(tooManyPixels)).status, 413)
})

test('上传重试复用文件，请求键不能被替换为另一份内容', async () => {
  const repeated = await upload(png, uploadKey)
  assert.equal(repeated.status, 200)
  assert.equal(((await repeated.json()) as { image: UploadedImage }).image.id, imageA.id)
  assert.equal(await db.storedFile.count({ where: { ownerId: testOwners[0], uploadKey } }), 1)
  assert.equal((await upload(Buffer.from('different'), uploadKey)).status, 409)
})

test('图片只允许本人读取，存储桶不允许匿名读取对象', async () => {
  const path = `/api/account/files/${imageA.id}/content`
  const own = await api(path)
  assert.equal(own.status, 200)
  assert.equal(own.headers.get('content-type'), 'image/png')
  assert.match(own.headers.get('cache-control') ?? '', /no-store/)
  assert.equal((await api(path, cookieB)).status, 404)
  assert.equal((await api(path, '')).status, 401)
  const file = await db.storedFile.findUniqueOrThrow({ where: { id: imageA.id } })
  const anonymous = await fetch(
    `${process.env.NUXT_STORAGE_ENDPOINT}/${store.bucket}/${file.objectKey}`,
  )
  assert.equal(anonymous.status, 403)
  const invalid = await api('/api/account/recognitions', cookieA, {
    fileId: imageB.id,
    mode: 'handwritten',
    requestKey: randomUUID(),
  })
  assert.equal(invalid.status, 404)
  const ownB = await api('/api/account/recognitions', cookieB, {
    fileId: imageB.id,
    mode: 'printed',
    requestKey: randomUUID(),
  })
  assert.equal(ownB.status, 200)
  foreignFormulaId = ((await ownB.json()) as SavedRecognition).formulaId
})

test('模拟识别原子保存任务、公式和原始版本，并明确标记 isMock', async () => {
  const response = await api('/api/account/recognitions', cookieA, {
    fileId: imageA.id,
    mode: 'handwritten',
    requestKey: randomUUID(),
    ownerId: testOwners[1],
  })
  assert.equal(response.status, 200)
  recognitionA = (await response.json()) as SavedRecognition
  assert.equal(recognitionA.isMock, true)
  const task = await db.recognitionTask.findUniqueOrThrow({ where: { id: recognitionA.taskId } })
  assert.equal(task.ownerId, testOwners[0])
  assert.equal(task.status, 'COMPLETED')
  original = (await (
    await api(`/api/account/formulas/${recognitionA.formulaId}`)
  ).json()) as SavedFormula
  assert.equal(original.versions.length, 1)
  assert.equal(original.versions[0]?.origin, 'RECOGNITION')
  assert.equal(original.versions[0]?.isMock, true)
  assert.equal(original.image?.id, imageA.id)
})

test('并发重放同一识别请求只生成一条结果，模式变化不能复用请求键', async () => {
  const requestKey = randomUUID()
  const body = { fileId: imageA.id, mode: 'handwritten', requestKey }
  const responses = await Promise.all([
    api('/api/account/recognitions', cookieA, body),
    api('/api/account/recognitions', cookieA, body),
  ])
  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200],
  )
  const results = await Promise.all(
    responses.map((response) => response.json() as Promise<SavedRecognition>),
  )
  assert.equal(results[0]?.formulaId, results[1]?.formulaId)
  assert.equal(await db.recognitionTask.count({ where: { ownerId: testOwners[0], requestKey } }), 1)
  assert.equal(
    (await api('/api/account/recognitions', cookieA, { ...body, mode: 'printed' })).status,
    409,
  )
})

test('其他用户不能读取公式或追加版本，未登录不能上传和保存', async () => {
  const path = `/api/account/formulas/${recognitionA.formulaId}`
  assert.equal((await api(path, cookieB)).status, 404)
  assert.equal(
    (
      await api(`${path}/versions`, cookieB, {
        title: '越权',
        latex: 'x',
        expectedVersionId: original.versions[0]!.id,
      })
    ).status,
    404,
  )
  assert.equal((await upload(png, randomUUID(), '')).status, 401)
  assert.equal(
    (
      await api('/api/account/recognitions', '', {
        fileId: imageA.id,
        mode: 'handwritten',
        requestKey: randomUUID(),
      })
    ).status,
    401,
  )
})

test('确认修改生成新版，刷新可读取，原始结果和原图仍保留', async () => {
  const response = await api(`/api/account/formulas/${recognitionA.formulaId}/versions`, cookieA, {
    title: '  保存后的公式  ',
    latex: 'E = mc^2',
    expectedVersionId: original.versions[0]!.id,
  })
  assert.equal(response.status, 200)
  const refreshed = (await (
    await api(`/api/account/formulas/${recognitionA.formulaId}`)
  ).json()) as SavedFormula
  assert.equal(refreshed.title, '保存后的公式')
  assert.equal(refreshed.versions.length, 2)
  assert.equal(refreshed.versions[0]?.latex, original.versions[0]?.latex)
  assert.equal(refreshed.versions[1]?.latex, 'E = mc^2')
  assert.equal(refreshed.versions[1]?.origin, 'MANUAL')
  assert.equal(refreshed.image?.id, imageA.id)
})

test('并发修改旧版本只允许一份成功，另一份返回明确的 409', async () => {
  const current = (await (
    await api(`/api/account/formulas/${recognitionA.formulaId}`)
  ).json()) as SavedFormula
  const bodies = ['x = 1', 'x = 2'].map((latex) => ({
    title: '并发保存',
    latex,
    expectedVersionId: current.versions.at(-1)!.id,
  }))
  const responses = await Promise.all(
    bodies.map((body) =>
      api(`/api/account/formulas/${recognitionA.formulaId}/versions`, cookieA, body),
    ),
  )
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409])
  const after = (await (
    await api(`/api/account/formulas/${recognitionA.formulaId}`)
  ).json()) as SavedFormula
  assert.equal(after.versions.length, current.versions.length + 1)
})

test('相同内容或只改名称不会制造空版本', async () => {
  const path = `/api/account/formulas/${recognitionA.formulaId}`
  const current = (await (await api(path)).json()) as SavedFormula
  const latest = current.versions.at(-1)!
  assert.equal(
    (
      await api(`${path}/versions`, cookieA, {
        title: '只修改名称',
        latex: latest.latex,
        expectedVersionId: latest.id,
      })
    ).status,
    200,
  )
  const after = (await (await api(path)).json()) as SavedFormula
  assert.equal(after.title, '只修改名称')
  assert.equal(after.versions.length, current.versions.length)
})

test('账号历史分页不混入其他用户，页面可按记录重新打开原图', async () => {
  for (let index = 0; index < 21; index++)
    await createFormula(db, {
      ownerId: testOwners[0]!,
      title: `历史分页-${index}`,
      latex: 'x',
      origin: 'DEMO',
      isMock: true,
    })
  const first = (await (await api('/api/account/formulas')).json()) as FormulaHistoryPage
  assert.equal(first.items.length, 20)
  assert.ok(first.nextCursor)
  const second = (await (
    await api(`/api/account/formulas?cursor=${first.nextCursor}`)
  ).json()) as FormulaHistoryPage
  const ids = [...first.items, ...second.items].map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(ids.includes(foreignFormulaId), false)
  assert.equal(ids.includes(recognitionA.formulaId), true)
  assert.equal((await api(`/api/account/formulas?cursor=${foreignFormulaId}`)).status, 404)
  assert.equal((await api(`/account/formulas/${recognitionA.formulaId}`)).status, 200)
  assert.equal((await api(`/api/account/files/${imageA.id}/content`)).status, 200)
})

test('存储失败不产生可识别的 READY 文件，补偿后允许同请求重试', async () => {
  const key = randomUUID()
  const input = {
    ownerId: testOwners[0]!,
    uploadKey: key,
    name: '故障重试.png',
    mimeType: 'image/png',
    data: png,
  }
  const fault = {
    ...store,
    async put() {
      throw new Error('注入存储故障')
    },
  }
  await assert.rejects(uploadPrivateImage(db, fault, input))
  const failed = await db.storedFile.findUniqueOrThrow({
    where: { ownerId_uploadKey: { ownerId: input.ownerId, uploadKey: key } },
  })
  assert.equal(failed.status, 'DELETED')
  const retried = await uploadPrivateImage(db, store, input)
  assert.equal(retried.id, failed.id)
  assert.equal(
    (await db.storedFile.findUniqueOrThrow({ where: { id: retried.id } })).status,
    'READY',
  )
})

test('跨站写请求及不完整的版本参数被拒绝，不修改既有记录', async () => {
  const body = { fileId: imageA.id, mode: 'handwritten', requestKey: randomUUID() }
  assert.equal(
    (await api('/api/account/recognitions', cookieA, body, { origin: 'https://untrusted.invalid' }))
      .status,
    403,
  )
  const path = `/api/account/formulas/${recognitionA.formulaId}/versions`
  assert.equal((await api(path, cookieA, { title: '不完整请求', latex: 'x' })).status, 400)
})
