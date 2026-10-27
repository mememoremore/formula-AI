import { testEnvironment } from './support/integration.ts'
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { setTimeout as delay } from 'node:timers/promises'
import { createAuthentication } from '../server/auth/config'
import { createDatabaseClient } from '../server/database/client'
import { createObjectStore } from '../server/storage/object-store'
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

test('公开关于页SSR不序列化登录身份，私有页面仍拒绝共享缓存', async () => {
  const user = await db.user.findUniqueOrThrow({ where: { id: ownerId } })
  for (const path of ['/about', '/help', '/feedback']) {
    const response = await fetch(base + path, { headers: { cookie } })
    assert.equal(response.status, 200)
    const html = await response.text()
    for (const value of [user.id, user.email, user.displayName]) {
      assert.ok(value && !html.includes(value), `${path} 不应包含登录用户资料`)
    }
    // 账号边界插件注册的空Nuxt缓存槽使用 -1 表示 undefined，不含Session资料。
    assert.match(html, /"account-session":-1/, `${path} 只能包含未读取的空Session缓存槽`)
  }
  const privatePage = await fetch(base + '/profile', { headers: { cookie } })
  assert.equal(privatePage.status, 200)
  assert.match(privatePage.headers.get('cache-control') ?? '', /private.*no-store/)
  assert.match(privatePage.headers.get('vary') ?? '', /cookie/i)
})
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

async function defaultUpdate(body: unknown, identity = cookie) {
  return fetch(base + '/api/auth/update-user', {
    method: 'POST',
    headers: { cookie: identity, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
test('R9 默认资料入口允许合法昵称，拒绝头像、空昵称和受保护字段', async () => {
  assert.equal((await defaultUpdate({ name: ' 默认入口新昵称 ' })).status, 200)
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: ownerId } })).displayName,
    '默认入口新昵称',
  )
  for (const body of [
    { image: 'https://evil.test/a.png' },
    { image: null },
    { avatar: 'avatars/other/a.webp' },
    { email: 'other@formula.test' },
    { emailVerified: true },
    { id: randomUUID() },
    { name: ' ' },
    { name: null },
    { name: 42 },
    { name: {} },
    { name: [] },
  ]) {
    const response = await defaultUpdate(body)
    assert.equal(response.status, 400)
    assert.ok((await response.json()).message)
  }
  assert.equal((await defaultUpdate({ name: '未登录' }, '')).status, 401)
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: ownerId } })).displayName,
    '默认入口新昵称',
  )
})
test('R9 注册不能插入任意头像引用，不影响正常注册与账号归属', async () => {
  const email = 'profile-other-' + randomUUID() + '@formula.test'
  const register = async (image?: string) => {
    const body = JSON.stringify({
      email,
      name: '另一名用户',
      password: randomBytes(24).toString('base64url'),
      ...(image === undefined ? {} : { image }),
    })
    const send = () =>
      fetch(base + '/api/auth/sign-up/email', {
        method: 'POST',
        headers: { origin: base, 'content-type': 'application/json' },
        body,
      })
    let response = await send()
    if (response.status === 429) {
      // 完整套件共享回环地址。仅对明确未执行的限流拒绝等候，不重试未知提交结果。
      const seconds = Number(
        response.headers.get('retry-after') ?? response.headers.get('x-retry-after'),
      )
      assert.ok(
        Number.isInteger(seconds) && seconds > 0 && seconds <= 60,
        '服务器应提供有界 Retry-After',
      )
      await response.arrayBuffer()
      await delay(seconds * 1000)
      response = await send()
    }
    return response
  }
  assert.equal((await register('https://evil.test/a.png')).status, 400)
  assert.equal(await db.user.count({ where: { email } }), 0)
  const response = await register()
  assert.equal(response.status, 200)
  const otherCookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  try {
    assert.equal((await defaultUpdate({ name: '另一账号的新昵称' }, otherCookie)).status, 200)
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: ownerId } })).displayName,
      '默认入口新昵称',
    )
    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#683fff' },
    })
      .png()
      .toBuffer()
    assert.equal(
      (
        await update({
          name: '账号本人',
          avatar: 'data:image/png;base64,' + png.toString('base64'),
        })
      ).status,
      200,
    )
    const oldKey = (await db.user.findUniqueOrThrow({ where: { id: ownerId } })).image
    assert.ok(oldKey)
    assert.equal((await defaultUpdate({ image: oldKey }, otherCookie)).status, 400)
    assert.equal(
      (await fetch(base + '/api/account/avatar', { headers: { cookie: otherCookie } })).status,
      404,
    )
    assert.equal((await fetch(base + '/api/account/avatar', { headers: { cookie } })).status, 200)
    assert.equal((await update({ name: '账号本人', avatar: null })).status, 200)
  } finally {
    await db.user.deleteMany({ where: { email } })
  }
})

test('R9 真实私有存储保留仍在使用的头像，仅在成功替换或重置后删除旧对象', async () => {
  const store = createObjectStore({ ...testEnvironment.storage, region: 'us-east-1' })
  const image = async (background: string) =>
    'data:image/png;base64,' +
    (
      await sharp({ create: { width: 48, height: 64, channels: 3, background } })
        .png()
        .toBuffer()
    ).toString('base64')
  try {
    assert.equal(
      (await update({ name: '头像生命周期', avatar: await image('#683fff') })).status,
      200,
    )
    const first = (await db.user.findUniqueOrThrow({ where: { id: ownerId } })).image!
    assert.ok((await store.get(first)).length > 0)
    assert.equal((await update({ name: '仅修改昵称' })).status, 200)
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: ownerId } })).image, first)
    assert.equal(
      (await update({ name: '拒绝错误图片', avatar: 'data:image/png;base64,AAAA' })).status,
      415,
    )
    const truncated = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64')
    assert.equal(
      (await update({ name: '拒绝损坏PNG', avatar: 'data:image/png;base64,' + truncated })).status,
      400,
    )
    assert.ok((await store.get(first)).length > 0, '失败写入不能删除仍在用的头像')
    assert.equal((await update({ name: '新头像', avatar: await image('#25875a') })).status, 200)
    const second = (await db.user.findUniqueOrThrow({ where: { id: ownerId } })).image!
    assert.notEqual(second, first)
    assert.ok((await store.get(second)).length > 0)
    await assert.rejects(store.get(first))
    assert.equal((await update({ name: '恢复默认', avatar: null })).status, 200)
    await assert.rejects(store.get(second))
  } finally {
    await update({ name: '资料验收用户', avatar: null })
  }
})
