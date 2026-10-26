import { testEnvironment } from './support/integration.ts'
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { createAuthentication } from '../server/auth/config'
import { createDatabaseClient } from '../server/database/client'
const base = testEnvironment.apiUrl
const db = createDatabaseClient(testEnvironment.databaseUrl)
let cookie = '',
  ownerId = ''
before(async () => {
  const auth = createAuthentication(db, {
    secret: process.env.NUXT_AUTH_SECRET ?? '',
    baseURL: base,
    isDevelopment: true,
  })
  const response = await auth.api.signUpEmail({
    body: {
      email: 'profile-' + randomUUID() + '@formula.test',
      name: '资料验收用户',
      password: randomBytes(24).toString('base64url'),
    },
    asResponse: true,
  })
  assert.equal(response.status, 200)
  ownerId = (await response.json()).user.id
  cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
})
after(async () => {
  if (ownerId) await db.user.delete({ where: { id: ownerId } })
  await db.$disconnect()
})
async function update(body: unknown, source = base, identity = cookie) {
  return fetch(base + '/api/account/profile', {
    method: 'PATCH',
    headers: { cookie: identity, origin: source, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
test('未登录与跨站请求不能修改资料', async () => {
  assert.equal((await update({ name: '其他名字' }, base, '')).status, 401)
  assert.equal((await update({ name: '其他名字' }, 'https://evil.test')).status, 403)
})
test('资料验证失败不改变原账户，昵称不允许通过输入改邮箱', async () => {
  assert.equal((await update({ name: ' ' })).status, 400)
  assert.equal((await update({ name: '资料新昵称', email: 'other@formula.test' })).status, 200)
  const user = await db.user.findUniqueOrThrow({ where: { id: ownerId } })
  assert.equal(user.displayName, '资料新昵称')
  assert.ok(user.email.startsWith('profile-'))
})
test('头像私有读取、重新编码及重置', async () => {
  const png = await sharp({
    create: { width: 100, height: 80, channels: 3, background: '#6257e5' },
  })
    .png()
    .toBuffer()
  try {
    assert.equal(
      (
        await update({
          name: '资料新昵称',
          avatar: 'data:image/png;base64,' + png.toString('base64'),
        })
      ).status,
      200,
    )
    const session = await fetch(base + '/api/account/session', { headers: { cookie } }).then((r) =>
      r.json(),
    )
    assert.match(session.user.image, /^\/api\/account\/avatar\?v=/)
    const response = await fetch(base + session.user.image, { headers: { cookie } })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/webp')
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width, 512)
    assert.equal((await fetch(base + session.user.image)).status, 401)
  } finally {
    assert.equal((await update({ name: '资料新昵称', avatar: null })).status, 200)
  }
  assert.equal((await fetch(base + '/api/account/avatar', { headers: { cookie } })).status, 404)
})

test('最近识别能重新找到失败任务，并拒绝无身份与无效游标', async () => {
  const file = await db.storedFile.create({
    data: {
      ownerId,
      kind: 'IMAGE',
      status: 'READY',
      bucket: 'ui-test',
      objectKey: randomUUID(),
      name: '待重试公式.png',
      mimeType: 'image/png',
      sizeBytes: 1,
      width: 1,
      height: 1,
    },
  })
  const timestamp = new Date()
  const task = await db.recognitionTask.create({
    data: {
      ownerId,
      inputFileId: file.id,
      requestKey: randomUUID(),
      mode: 'HANDWRITTEN',
      status: 'FAILED',
      errorCode: 'INVALID_IMAGE',
      errorMessage: '图片不够清晰',
      createdAt: timestamp,
      finishedAt: timestamp,
    },
  })
  const response = await fetch(base + '/api/account/recognitions', { headers: { cookie } })
  assert.equal(response.status, 200)
  const page = await response.json()
  assert.ok(
    page.items.some(
      (item: { id: string; status: string; title: string }) =>
        item.id === task.id && item.status === 'FAILED' && item.title === '待重试公式.png',
    ),
  )
  assert.equal((await fetch(base + '/api/account/recognitions')).status, 401)
  assert.equal(
    (
      await fetch(base + '/api/account/recognitions?cursor=' + randomUUID(), {
        headers: { cookie },
      })
    ).status,
    404,
  )
})
