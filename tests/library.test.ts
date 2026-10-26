import { testEnvironment } from './support/integration.ts'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { before, after, test } from 'node:test'
import { createAuthentication } from '../server/auth/config'
import { createDatabaseClient } from '../server/database/client'
import { createFormula, appendFormulaVersion } from '../server/database/formulas'
import type {
  AccountCategory,
  CategoryCollection,
  FormulaLibraryPage,
} from '../shared/types/library'
import type { SavedFormula } from '../shared/types/workspace'

const baseURL = testEnvironment.apiUrl
const origin = process.env.NUXT_AUTH_BASE_URL ?? baseURL
const db = createDatabaseClient(testEnvironment.databaseUrl)
const owners: string[] = []
const cookies: string[] = []
let firstId = ''
let foreignId = ''
let category: AccountCategory

async function api(path: string, method = 'GET', body?: unknown, user = 0, source = origin) {
  return fetch(`${baseURL}/api/account${path}`, {
    method,
    headers: {
      cookie: cookies[user] ?? '',
      origin: source,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
}
async function library(query = '', user = 0) {
  const response = await api(`/library${query}`, 'GET', undefined, user)
  assert.equal(response.status, 200)
  return (await response.json()) as FormulaLibraryPage
}

before(async () => {
  await db.$connect()
  const auth = createAuthentication(db, {
    baseURL: origin,
    secret: process.env.NUXT_AUTH_SECRET ?? '',
    isDevelopment: false,
  })
  for (const label of ['a', 'b']) {
    const result = await auth.api.signUpEmail({
      body: {
        name: '公式库验收临时用户',
        email: `library-${label}-${randomUUID()}@formula.test`,
        password: randomBytes(24).toString('base64url'),
      },
      returnHeaders: true,
    })
    owners.push(result.response.user.id)
    cookies.push(
      result.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; '),
    )
  }
  for (let index = 0; index < 25; index++) {
    const { formula, version } = await createFormula(db, {
      ownerId: owners[0]!,
      title: index === 0 ? '微积分 Alpha_100%\\标题' : `公式 ${index}`,
      latex: index === 0 ? '\\oldOnlyToken' : `x_{${index}}=1`,
      origin: 'DEMO',
      isMock: true,
    })
    // 相同时间戳也必须靠 UUID 保证稳定分页。
    await db.formula.update({
      where: { id: formula.id },
      data: { createdAt: new Date('2026-01-01T00:00:00Z') },
    })
    if (index === 0) {
      firstId = formula.id
      await appendFormulaVersion(db, {
        ownerId: owners[0]!,
        formulaId: formula.id,
        expectedVersionId: version.id,
        latex: '\\int NewOnlyToken \\mathrm{a_b\\%}',
      })
    }
  }
  foreignId = (
    await createFormula(db, {
      ownerId: owners[1]!,
      title: '他人的秘密',
      latex: 'private=1',
      origin: 'DEMO',
      isMock: true,
    })
  ).formula.id
})
after(async () => {
  try {
    await db.user.deleteMany({ where: { id: { in: owners } } })
  } finally {
    await db.$disconnect()
  }
})

test('公式库只列出本人数据，响应私有且不泄漏存储或认证字段', async () => {
  const response = await api('/library')
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/)
  const result = (await response.json()) as FormulaLibraryPage
  assert.equal(result.items.length, 20)
  assert.equal(
    result.items.some((item) => item.id === foreignId),
    false,
  )
  assert.deepEqual(
    Object.keys(result.items[0]!).sort(),
    [
      'category',
      'createdAt',
      'favorite',
      'id',
      'imageId',
      'isMock',
      'latex',
      'title',
      'versionNumber',
    ].sort(),
  )
  assert.equal(result.items[0]!.imageId, null, '无原图的演示公式不应暴露其他文件编号')
  assert.equal((await library('', 1)).items.length, 1)
})

test('相同创建时间的25条公式分页无重复无遗漏', async () => {
  const first = await library()
  assert.ok(first.nextCursor)
  const second = await library(`?cursor=${first.nextCursor}`)
  assert.equal(second.items.length, 5)
  assert.equal(second.nextCursor, null)
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.id)).size, 25)
})

test('标题与最新LaTeX可搜索，忽略大小写，不匹配旧版本内容', async () => {
  assert.equal((await library('?q=alpha')).items[0]?.id, firstId)
  assert.equal((await library('?q=newonlytoken')).items[0]?.versionNumber, 2)
  assert.equal((await library('?q=oldOnlyToken')).items.length, 0)
  assert.equal((await library(`?q=${encodeURIComponent('他人的秘密')}`)).items.length, 0)
})

test('百分号、下划线、反斜杠和SQL片段按普通文本搜索', async () => {
  for (const term of ['100%', '_100', '\\标题', '\\int'])
    assert.equal((await library(`?q=${encodeURIComponent(term)}`)).items[0]?.id, firstId)
  assert.equal((await library(`?q=${encodeURIComponent("' OR 1=1 --")}`)).items.length, 0)
})

test('分类可新建并去除首尾空格，同用户重名冲突，其他用户允许同名', async () => {
  const response = await api('/categories', 'POST', { name: '  高等数学  ', ownerId: owners[1] })
  assert.equal(response.status, 200)
  category = (await response.json()) as AccountCategory
  assert.equal(category.name, '高等数学')
  assert.equal(category.formulaCount, 0)
  assert.equal((await api('/categories', 'POST', { name: '高等数学' })).status, 409)
  assert.equal((await api('/categories', 'POST', { name: '高等数学' }, 1)).status, 200)
})

test('公式归类及分类统计真实持久化，分类不创建内容版本', async () => {
  const response = await api(`/formulas/${firstId}/category`, 'PUT', { categoryId: category.id })
  assert.equal(response.status, 200)
  const detail = (await response.json()) as SavedFormula
  assert.equal(detail.category?.id, category.id)
  assert.equal(detail.versions.length, 2)
  const categories = (await (await api('/categories')).json()) as CategoryCollection
  assert.equal(categories.items.find((item) => item.id === category.id)?.formulaCount, 1)
  assert.equal(categories.totalCount, 25)
  assert.equal(categories.uncategorizedCount, 24)
  assert.equal((await library(`?category=${category.id}`)).items[0]?.id, firstId)
  assert.equal(
    (await library('?category=uncategorized')).items.some((item) => item.id === firstId),
    false,
  )
})

test('收藏显式设置可安全重复和并发重试，数据库只有一条记录', async () => {
  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      api(`/formulas/${firstId}/favorite`, 'PUT', { favorite: true }),
    ),
  )
  assert.deepEqual(
    responses.map((item) => item.status),
    [200, 200, 200, 200],
  )
  assert.equal(await db.favorite.count({ where: { ownerId: owners[0], formulaId: firstId } }), 1)
  const detail = (await (await api(`/formulas/${firstId}`)).json()) as SavedFormula
  assert.equal(detail.favorite, true)
})

test('搜索、分类和收藏可组合，筛选不能越过用户归属', async () => {
  assert.equal(
    (await library(`?category=${category.id}&favorites=true&q=alpha`)).items[0]?.id,
    firstId,
  )
  assert.equal((await library(`?category=${category.id}&favorites=true&q=不存在`)).items.length, 0)
  assert.equal((await library('?favorites=true', 1)).items.length, 0)
})

test('分类改名同步显示在列表与公式详情，重名返回409', async () => {
  assert.equal(
    (await api(`/categories/${category.id}`, 'PATCH', { name: '微积分笔记' })).status,
    200,
  )
  assert.equal((await library(`?category=${category.id}`)).items[0]?.category?.name, '微积分笔记')
  await api('/categories', 'POST', { name: '代数' })
  assert.equal((await api(`/categories/${category.id}`, 'PATCH', { name: '代数' })).status, 409)
})

test('分类删除事务保留公式、原始版本和收藏，公式回到未分类', async () => {
  assert.equal((await api(`/categories/${category.id}`, 'DELETE')).status, 200)
  const detail = (await (await api(`/formulas/${firstId}`)).json()) as SavedFormula
  assert.equal(detail.category, null)
  assert.equal(detail.favorite, true)
  assert.equal(detail.versions.length, 2)
  assert.equal(detail.versions[0]?.latex, '\\oldOnlyToken')
  assert.equal((await library('?category=uncategorized&favorites=true')).items[0]?.id, firstId)
})

test('取消收藏可重复提交，公式不删除，收藏筛选立即为空', async () => {
  for (let index = 0; index < 2; index++)
    assert.equal(
      (await api(`/formulas/${firstId}/favorite`, 'PUT', { favorite: false })).status,
      200,
    )
  assert.equal((await library('?favorites=true')).items.length, 0)
  assert.equal((await api(`/formulas/${firstId}`)).status, 200)
})

test('他人公式、分类及分页游标统一拒绝404', async () => {
  const otherCategory = (await (
    await api('/categories', 'POST', { name: '私有分类' }, 1)
  ).json()) as AccountCategory
  for (const [path, method, body] of [
    [`/formulas/${foreignId}/favorite`, 'PUT', { favorite: true }],
    [`/formulas/${foreignId}/category`, 'PUT', { categoryId: null }],
    [`/formulas/${firstId}/category`, 'PUT', { categoryId: otherCategory.id }],
    [`/categories/${otherCategory.id}`, 'PATCH', { name: '篡改' }],
    [`/categories/${otherCategory.id}`, 'DELETE', undefined],
  ] as const)
    assert.equal((await api(path, method, body)).status, 404)
  assert.equal((await api(`/library?category=${otherCategory.id}`)).status, 404)
  assert.equal((await api(`/library?cursor=${foreignId}`)).status, 404)
})

test('无效参数、空名称、超长名称、控制字符及非布尔收藏均被拒绝', async () => {
  for (const query of [
    '?q=a&q=b',
    `?q=${'a'.repeat(201)}`,
    '?category=bad',
    '?cursor=bad',
    '?favorites=yes',
  ])
    assert.equal((await api(`/library${query}`)).status, 400)
  for (const name of ['', '   ', 'a'.repeat(51), '换\n行'])
    assert.equal((await api('/categories', 'POST', { name })).status, 400)
  assert.equal(
    (await api(`/formulas/${firstId}/favorite`, 'PUT', { favorite: 'true' })).status,
    400,
  )
  assert.equal((await api(`/formulas/${firstId}/category`, 'PUT', {})).status, 400)
})

test('未登录所有接口401，跨站写操作403且不写入数据库', async () => {
  for (const [path, method, body] of [
    ['/library', 'GET', undefined],
    ['/categories', 'GET', undefined],
    ['/categories', 'POST', { name: '禁止写入' }],
    [`/formulas/${firstId}/favorite`, 'PUT', { favorite: true }],
  ] as const)
    assert.equal((await api(path, method, body, 99)).status, 401)
  assert.equal(
    (await api('/categories', 'POST', { name: '禁止写入' }, 0, 'https://foreign.invalid')).status,
    403,
  )
  assert.equal(await db.category.count({ where: { ownerId: owners[0], name: '禁止写入' } }), 0)
})

test('分类删除与归类并发，不产生悬空关系或500错误', async () => {
  const target = (await (
    await api('/categories', 'POST', { name: '并发分类' })
  ).json()) as AccountCategory
  const responses = await Promise.all([
    api(`/formulas/${firstId}/category`, 'PUT', { categoryId: target.id }),
    api(`/categories/${target.id}`, 'DELETE'),
  ])
  for (const response of responses)
    assert.ok([200, 404, 409].includes(response.status), `意外状态：${response.status}`)
  const saved = await db.formula.findUniqueOrThrow({ where: { id: firstId } })
  assert.equal(saved.categoryId, null)
})
