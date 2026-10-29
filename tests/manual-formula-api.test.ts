import { testEnvironment } from './support/integration.ts'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { before, after, test } from 'node:test'
import pg from 'pg'
import { createAuthentication } from '../server/auth/config'
import { createDatabaseClient } from '../server/database/client'
import { createFormula, appendFormulaVersion } from '../server/database/formulas'
import type { SavedFormula } from '../shared/types/workspace'
const db = createDatabaseClient(testEnvironment.databaseUrl),
  owners: string[] = [],
  cookies: string[] = []
const base = testEnvironment.apiUrl
async function api(
  path: string,
  method = 'GET',
  body?: unknown,
  user = 0,
  headers: Record<string, string> = {},
) {
  return fetch(base + '/api/account' + path, {
    method,
    headers: {
      cookie: cookies[user] ?? '',
      origin: base,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}
const input = (title = '手动公式') => ({ requestKey: randomUUID(), title, latex: '\\frac{1}{2}' })
let saved: SavedFormula,
  first = input()
before(async () => {
  await db.$connect()
  const auth = createAuthentication(db, {
    baseURL: base,
    secret: process.env.NUXT_AUTH_SECRET ?? '',
    isDevelopment: false,
  })
  for (let i = 0; i < 3; i++) {
    const value = await auth.api.signUpEmail({
      body: {
        name: 'R18隔离用户',
        email: `r18-${randomUUID()}@formula.test`,
        password: randomBytes(24).toString('base64url'),
      },
      returnHeaders: true,
    })
    owners.push(value.response.user.id)
    cookies.push(
      value.headers
        .getSetCookie()
        .map((x) => x.split(';')[0])
        .join('; '),
    )
  }
})
after(async () => {
  try {
    await db.user.deleteMany({ where: { id: { in: owners } } })
  } finally {
    await db.$disconnect()
  }
})
test('增量迁移在连接私有临时表上保留旧数据并放开MANUAL首版本', async () => {
  // R1 guard above proves the target; temporary tables shadow public names only on this connection.
  const client = new pg.Client({ connectionString: testEnvironment.databaseUrl })
  await client.connect()
  try {
    await client.query(
      'CREATE TEMP TABLE formulas (LIKE public.formulas INCLUDING DEFAULTS INCLUDING CONSTRAINTS); ALTER TABLE pg_temp.formulas DROP COLUMN "creationKey", DROP COLUMN "creationHash"; CREATE TEMP TABLE formula_versions (LIKE public.formula_versions INCLUDING DEFAULTS INCLUDING CONSTRAINTS)',
    )
    await client.query(
      `ALTER TABLE pg_temp.formula_versions DROP CONSTRAINT formula_versions_origin_order; ALTER TABLE pg_temp.formula_versions ADD CONSTRAINT formula_versions_origin_order CHECK ((number=1 AND origin IN ('RECOGNITION','DEMO')) OR (number>1 AND origin='MANUAL'))`,
    )
    const id = randomUUID(),
      owner = owners[0]!
    await client.query(
      'INSERT INTO pg_temp.formulas(id,"ownerId",title,"updatedAt") VALUES($1,$2,$3,now())',
      [id, owner, '旧公式'],
    )
    await client.query(
      'INSERT INTO pg_temp.formula_versions(id,"formulaId","ownerId",number,latex,origin,"isMock") VALUES($1,$2,$3,1,$4,$5,true)',
      [randomUUID(), id, owner, 'x=1', 'DEMO'],
    )
    await assert.rejects(
      client.query(
        'INSERT INTO pg_temp.formula_versions(id,"formulaId","ownerId",number,latex,origin) VALUES($1,$2,$3,1,$4,$5)',
        [randomUUID(), id, owner, 'y=2', 'MANUAL'],
      ),
    )
    await client.query(
      readFileSync('prisma/migrations/202610290001_manual_formulas/migration.sql', 'utf8'),
    )
    assert.equal(
      (await client.query('SELECT latex FROM pg_temp.formula_versions')).rows[0].latex,
      'x=1',
    )
    await client.query(
      'INSERT INTO pg_temp.formula_versions(id,"formulaId","ownerId",number,latex,origin) VALUES($1,$2,$3,1,$4,$5)',
      [randomUUID(), id, owner, 'y=2', 'MANUAL'],
    )
    assert.equal(
      (await client.query('SELECT count(*)::int AS n FROM pg_temp.formula_versions')).rows[0].n,
      2,
    )
  } finally {
    await client.end()
  }
})
test('POST创建MANUAL首版本，无图片、无识别任务、无识别额度', async () => {
  const response = await api('/formulas', 'POST', first)
  assert.equal(response.status, 201)
  saved = (await response.json()) as SavedFormula
  assert.equal(saved.image, null)
  assert.equal(saved.versions.length, 1)
  assert.equal(saved.versions[0]!.origin, 'MANUAL')
  assert.equal(saved.versions[0]!.isMock, false)
  assert.equal(saved.versions[0]!.latex, first.latex)
  assert.equal(await db.recognitionTask.count({ where: { ownerId: owners[0] } }), 0)
  assert.equal(await db.dailyUsage.count({ where: { ownerId: owners[0] } }), 0)
})
test('已提交但响应丢弃，原键恢复为同一公式；改标题后重放仍不创建第二条', async () => {
  const body = input('丢弃响应')
  const response = await api('/formulas', 'POST', body)
  assert.equal(response.status, 201)
  await response.body?.cancel()
  const replay = await api('/formulas', 'POST', body)
  assert.equal(replay.status, 200)
  const formula = (await replay.json()) as SavedFormula
  await appendFormulaVersion(db, {
    ownerId: owners[0]!,
    formulaId: formula.id,
    expectedVersionId: formula.versions[0]!.id,
    expectedTitle: formula.title,
    title: '之后修改',
    latex: body.latex,
  })
  assert.equal(
    ((await (await api('/formulas', 'POST', body)).json()) as SavedFormula).id,
    formula.id,
  )
  assert.equal(
    await db.formula.count({ where: { ownerId: owners[0], creationKey: body.requestKey } }),
    1,
  )
})
test('同键不同内容409，非法语法/长度/外部资源400且不写入', async () => {
  for (const body of [
    { ...first, title: '不同名称' },
    { ...first, latex: 'x=2' },
  ])
    assert.equal((await api('/formulas', 'POST', body)).status, 409)
  const beforeCount = await db.formula.count({ where: { ownerId: owners[0] } })
  for (const body of [
    { ...input(), latex: '\\frac{' },
    { ...input(), latex: '\\href{https://invalid.test}{x}' },
    { ...input(), latex: 'x'.repeat(5001) },
    { ...input(), title: '' },
    { ...input(), requestKey: 'invalid' },
  ])
    assert.equal((await api('/formulas', 'POST', body)).status, 400)
  assert.equal(await db.formula.count({ where: { ownerId: owners[0] } }), beforeCount)
})
test('同账号多并发请求只创建一条公式和一个首版本', async () => {
  const body = input('并发重放'),
    results = await Promise.all(Array.from({ length: 6 }, () => api('/formulas', 'POST', body)))
  assert.equal(results.filter((x) => x.status === 201).length, 1)
  assert.equal(results.filter((x) => x.status === 200).length, 5)
  const values = (await Promise.all(results.map((x) => x.json()))) as SavedFormula[]
  assert.equal(new Set(values.map((x) => x.id)).size, 1)
  assert.equal(await db.formulaVersion.count({ where: { formulaId: values[0]!.id } }), 1)
})
test('并发争夺每分钟10次名额且满额仍可重放已有请求', async () => {
  const bodies = Array.from({ length: 12 }, (_, i) => input(`限流${i}`)),
    responses = await Promise.all(bodies.map((body) => api('/formulas', 'POST', body, 2)))
  assert.equal(responses.filter((r) => r.status === 201).length, 10)
  assert.equal(responses.filter((r) => r.status === 429).length, 2)
  const at = responses.findIndex((r) => r.status === 201)
  assert.equal((await api('/formulas', 'POST', bodies[at], 2)).status, 200)
  assert.equal(
    await db.formula.count({ where: { ownerId: owners[2], creationKey: { not: null } } }),
    10,
  )
})
test('请求键按账号隔离，未登录和跨站写入拒绝，切换账号旧请求403', async () => {
  assert.equal((await api('/formulas', 'POST', first, 99)).status, 401)
  assert.equal(
    (await api('/formulas', 'POST', input(), 0, { origin: 'https://untrusted.invalid' })).status,
    403,
  )
  assert.equal(
    (await api('/formulas', 'POST', input(), 1, { 'x-account-id': owners[0]! })).status,
    403,
  )
  assert.equal((await api('/formulas/' + saved.id, 'GET', undefined, 1)).status, 404)
  const own = await api('/formulas', 'POST', first, 1)
  assert.equal(own.status, 201)
  assert.notEqual(((await own.json()) as SavedFormula).id, saved.id)
})
test('手动公式继续沿用版本不可变、分类、收藏与列表语义', async () => {
  const category = await db.category.create({ data: { ownerId: owners[0]!, name: '手动公式分类' } })
  assert.equal(
    (await api(`/formulas/${saved.id}/category`, 'PUT', { categoryId: category.id })).status,
    200,
  )
  assert.equal((await api(`/formulas/${saved.id}/favorite`, 'PUT', { favorite: true })).status, 200)
  const next = await api(`/formulas/${saved.id}/versions`, 'POST', {
    title: '手动已编辑',
    latex: 'x^2=4',
    expectedVersionId: saved.versions[0]!.id,
    expectedTitle: saved.title,
  })
  assert.equal(next.status, 200)
  const value = (await next.json()) as SavedFormula
  assert.equal(value.versions.length, 2)
  assert.ok(value.versions.every((v) => v.origin === 'MANUAL'))
  await assert.rejects(
    db.formulaVersion.update({
      where: { id: value.versions[0]!.id },
      data: { latex: 'overwrite' },
    }),
  )
  const list = await api('/library?q=' + encodeURIComponent('手动已编辑'))
  assert.equal(list.status, 200)
  assert.match(JSON.stringify(await list.json()), new RegExp(saved.id))
})
test('原有识别/演示创建与MANUAL后续版本兼容，旧行创建身份仍为空', async () => {
  const old = await createFormula(db, {
    ownerId: owners[0]!,
    title: '旧路径',
    latex: 'z=1',
    origin: 'DEMO',
    isMock: true,
  })
  assert.equal(old.formula.creationKey, null)
  assert.equal(old.version.origin, 'DEMO')
  const edited = await appendFormulaVersion(db, {
    ownerId: owners[0]!,
    formulaId: old.formula.id,
    expectedVersionId: old.version.id,
    expectedTitle: old.formula.title,
    latex: 'z=2',
  })
  assert.equal(edited.origin, 'MANUAL')
  assert.equal(edited.number, 2)
})
