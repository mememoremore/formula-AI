import { testEnvironment } from './support/integration.ts'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { before, after, test } from 'node:test'
import { verifyPassword } from 'better-auth/crypto'
import { createAuthentication } from '../server/auth/config'
import { createDatabaseClient } from '../server/database/client'
import { createFormula, getFormula } from '../server/database/formulas'
import { readPrivateResource } from '../server/database/private-resources'

const baseURL = testEnvironment.apiUrl
const origin = process.env.NUXT_AUTH_BASE_URL ?? baseURL
const db = createDatabaseClient(testEnvironment.databaseUrl)
const suffix = randomUUID()
const emails = [
  `auth-a-${suffix}@formula.test`,
  `auth-b-${suffix}@formula.test`,
  `auth-invalid-${suffix}@formula.test`,
]
const password = `Test-${randomBytes(24).toString('base64url')}`
const limiterIP = `198.18.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`
interface TestAccount {
  id: string
  cookie: string
  sessionId: string
}
let accountA: TestAccount
let accountB: TestAccount
let resourcesA: Awaited<ReturnType<typeof provision>>
let resourcesB: Awaited<ReturnType<typeof provision>>

async function request(
  path: string,
  cookie = '',
  body?: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
) {
  return fetch(`${baseURL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      origin,
      cookie,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  })
}

async function register(email: string, name: string) {
  const requestedId = randomUUID()
  const response = await request('/api/auth/sign-up/email', '', {
    email,
    name,
    password,
    id: requestedId,
    emailVerified: true,
  })
  assert.equal(response.status, 200, '注册应成功，检查账号服务与数据库配置。')
  const data = (await response.json()) as { user: { id: string }; token: string }
  assert.notEqual(data.user.id, requestedId, '不能通过注册请求指定数据库用户标识。')
  const cookies = response.headers.getSetCookie()
  assert.equal(
    cookies.some((value) => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value)),
    true,
  )
  const cookie = cookies.map((value) => value.split(';')[0]).join('; ')
  const session = await db.authSession.findUniqueOrThrow({ where: { token: data.token } })
  return { id: data.user.id, cookie, sessionId: session.id }
}

async function provision(ownerId: string) {
  const category = await db.category.create({ data: { ownerId, name: '私有测试分类' } })
  const file = await db.storedFile.create({
    data: {
      ownerId,
      kind: 'IMAGE',
      bucket: 'auth-test',
      objectKey: randomUUID(),
      name: 'private.png',
      mimeType: 'image/png',
      sizeBytes: 100,
    },
  })
  const task = await db.recognitionTask.create({
    data: { ownerId, inputFileId: file.id, requestKey: randomUUID(), mode: 'HANDWRITTEN' },
  })
  const result = await createFormula(db, {
    ownerId,
    title: `私有公式-${ownerId}`,
    latex: 'E = mc^2',
    origin: 'DEMO',
    isMock: true,
    categoryId: category.id,
    recognitionTaskId: task.id,
  })
  const conversation = await db.conversation.create({
    data: { ownerId, formulaVersionId: result.version.id, title: '私有上下文' },
  })
  await db.chatMessage.create({
    data: {
      ownerId,
      conversationId: conversation.id,
      position: 1,
      role: 'USER',
      content: `仅属于-${ownerId}`,
    },
  })
  return {
    categories: category.id,
    files: file.id,
    tasks: task.id,
    formulas: result.formula.id,
    versions: result.version.id,
    conversations: conversation.id,
  }
}

before(async () => {
  await db.$connect()
  accountA = await register(emails[0]!.toUpperCase(), '测试用户甲')
  accountB = await register(emails[1]!, '测试用户乙')
  resourcesA = await provision(accountA.id)
  resourcesB = await provision(accountB.id)
})

after(async () => {
  try {
    // 只清理本次随机邮箱和专用限流测试地址，不清空账号表或其他人的限流状态。
    await db.user.deleteMany({ where: { email: { in: emails } } })
    await db.authRateLimit.deleteMany({ where: { key: { contains: limiterIP } } })
  } finally {
    await db.$disconnect()
  }
})

test('注册关联原有用户模型，邮箱归一化且密码只保存哈希', async () => {
  const user = await db.user.findUniqueOrThrow({ where: { id: accountA.id } })
  assert.equal(user.email, emails[0])
  assert.equal(user.displayName, '测试用户甲')
  assert.equal(user.emailVerified, false, '不能通过注册请求伪造邮箱已验证。')
  const credential = await db.authAccount.findFirstOrThrow({
    where: { userId: user.id, providerId: 'credential' },
  })
  assert.equal(credential.password === password, false)
  assert.equal(await verifyPassword({ hash: credential.password!, password }), true)
})

test('未登录只能读到空会话，私有 API 返回 401，账号页面引导登录', async () => {
  const session = await request('/api/account/session')
  assert.deepEqual(await session.json(), { user: null })
  assert.equal((await request('/api/account/overview')).status, 401)
  assert.equal(
    (await request(`/api/account/resources/formulas/${resourcesA.formulas}`)).status,
    401,
  )
  const page = await request('/account')
  assert.equal(page.status, 302)
  assert.equal(page.headers.get('location')?.startsWith('/login'), true)
})

test('注册拒绝短密码、空昵称和重复邮箱，不产生半成品用户', async () => {
  const short = await request('/api/auth/sign-up/email', '', {
    email: emails[2],
    name: '无效注册',
    password: 'short',
  })
  assert.equal(short.status, 400)
  const blank = await request('/api/auth/sign-up/email', '', {
    email: emails[2],
    name: '   ',
    password,
  })
  assert.equal(blank.status, 400)
  const duplicate = await request('/api/auth/sign-up/email', '', {
    email: emails[0],
    name: '重复注册',
    password,
  })
  assert.equal(duplicate.status, 422)
  assert.equal(await db.user.count({ where: { email: emails[2] } }), 0)
  assert.equal(await db.user.count({ where: { email: emails[0] } }), 1)
})

test('真实登录恢复会话，私有响应不包含令牌，SSR 刷新保持身份', async () => {
  const response = await request('/api/auth/sign-in/email', '', { email: emails[0], password })
  assert.equal(response.status, 200)
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  const session = await request('/api/account/session', cookie)
  const data = (await session.json()) as { user: { id: string }; token?: string; session?: unknown }
  assert.equal(data.user.id, accountA.id)
  assert.equal(data.token, undefined)
  assert.equal(data.session, undefined)
  const legacyPage = await request('/account', cookie)
  assert.equal(legacyPage.status, 302)
  assert.equal(legacyPage.headers.get('location'), '/profile?space=account')
  const page = await request('/profile?space=account', cookie)
  assert.equal(page.status, 200)
  assert.match(page.headers.get('cache-control') ?? '', /no-store/)
  const html = await page.text()
  assert.equal(html.includes(emails[0]!), true)
  assert.equal(html.includes(emails[1]!), false)
  const secondPage = await request('/profile?space=account', accountB.cookie)
  const secondHtml = await secondPage.text()
  assert.equal(secondHtml.includes(emails[1]!), true)
  assert.equal(secondHtml.includes(emails[0]!), false)
  assert.equal((await request('/account')).status, 302, '已登录的 SSR 结果不能被匿名请求复用。')
})

test('账号概况只统计当前用户，伪造 ownerId 参数不会切换身份', async () => {
  const response = await request(`/api/account/overview?ownerId=${accountB.id}`, accountA.cookie)
  assert.equal(response.status, 200)
  const data = (await response.json()) as {
    counts: { formulas: number }
    formulas: Array<{ id: string }>
  }
  assert.equal(data.counts.formulas, 1)
  assert.deepEqual(
    data.formulas.map((formula) => formula.id),
    [resourcesA.formulas],
  )
})

test('两名用户的公式、版本、文件、任务、分类与对话在 HTTP 层双向隔离', async () => {
  for (const kind of Object.keys(resourcesA) as Array<keyof typeof resourcesA>) {
    const ownA = await request(
      `/api/account/resources/${kind}/${resourcesA[kind]}`,
      accountA.cookie,
    )
    assert.equal(ownA.status, 200, `${kind}：本人可读取`)
    const ownB = await request(
      `/api/account/resources/${kind}/${resourcesB[kind]}`,
      accountB.cookie,
    )
    assert.equal(ownB.status, 200, `${kind}：第二名用户可读取自己的记录`)
    assert.equal(
      (
        await request(
          `/api/account/resources/${kind}/${resourcesB[kind]}?ownerId=${accountB.id}`,
          accountA.cookie,
        )
      ).status,
      404,
    )
    assert.equal(
      (await request(`/api/account/resources/${kind}/${resourcesA[kind]}`, accountB.cookie)).status,
      404,
    )
  }
  const file = await request(`/api/account/resources/files/${resourcesA.files}`, accountA.cookie)
  const data = (await file.json()) as { resource: Record<string, unknown> }
  assert.equal('bucket' in data.resource, false)
  assert.equal('objectKey' in data.resource, false)
})

test('无效与不存在的资源统一 404，缺失身份不会放宽 Prisma 查询', async () => {
  for (const id of ['not-a-uuid', randomUUID()]) {
    assert.equal(
      (await request(`/api/account/resources/formulas/${id}`, accountA.cookie)).status,
      404,
    )
  }
  assert.equal(await getFormula(db, undefined as unknown as string, resourcesA.formulas), null)
  assert.equal(
    await readPrivateResource(db, undefined as unknown as string, 'formulas', resourcesA.formulas),
    null,
  )
})

test('错误密码和篡改 Cookie 不能取得私有数据', async () => {
  assert.equal(
    (await request('/api/auth/sign-in/email', '', { email: emails[0], password: 'wrong-password' }))
      .status,
    401,
  )
  const tampered = accountA.cookie.replace(
    /=(.)/,
    (_, character: string) => `=${character === 'x' ? 'y' : 'x'}`,
  )
  assert.equal((await request('/api/account/overview', tampered)).status, 401)
})

test('跨站登录和退出请求被拒绝，原会话仍可使用', async () => {
  const headers = { origin: 'https://untrusted.invalid' }
  assert.equal(
    (await request('/api/auth/sign-in/email', '', { email: emails[0], password }, headers)).status,
    403,
  )
  assert.equal((await request('/api/auth/sign-out', accountA.cookie, {}, headers)).status, 403)
  assert.equal((await request('/api/account/overview', accountA.cookie)).status, 200)
})

test('过期会话即时失效，另一名用户不受影响', async () => {
  await db.authSession.update({
    where: { id: accountB.sessionId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  })
  assert.equal((await request('/api/account/overview', accountB.cookie)).status, 401)
  assert.equal((await request('/api/account/overview', accountA.cookie)).status, 200)
})

test('退出撤销数据库会话，重放原 Cookie 返回 401', async () => {
  assert.equal((await request('/api/auth/sign-out', accountA.cookie, {})).status, 200)
  assert.equal(await db.authSession.findUnique({ where: { id: accountA.sessionId } }), null)
  assert.equal((await request('/api/account/overview', accountA.cookie)).status, 401)
})

test('数据库限流在两个认证实例间共享，并发请求不能超过登录上限', async () => {
  const config = {
    secret: randomBytes(48).toString('base64url'),
    baseURL: 'https://auth-limit.invalid',
    isDevelopment: false,
  }
  const instances = [createAuthentication(db, config), createAuthentication(db, config)]
  const responses = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      instances[index % 2]!.handler(
        new Request('https://auth-limit.invalid/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            origin: config.baseURL,
            'content-type': 'application/json',
            'x-formula-client-ip': limiterIP,
          },
          body: JSON.stringify({ email: `absent-${suffix}@formula.test`, password }),
        }),
      ),
    ),
  )
  assert.equal(responses.filter((response) => response.status === 401).length, 8)
  assert.equal(responses.filter((response) => response.status === 429).length, 4)
})
