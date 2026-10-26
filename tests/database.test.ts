import { testEnvironment } from './support/integration.ts'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { createDatabaseClient } from '../server/database/client'
import { appendFormulaVersion, createFormula, getFormula } from '../server/database/formulas'
import { DatabaseOperationError } from '../server/database/errors'

const db = createDatabaseClient(testEnvironment.databaseUrl)
const ownerA = randomUUID()
const ownerB = randomUUID()
const testOwners = [ownerA, ownerB]
const categoryA = randomUUID()
const categoryB = randomUUID()
const fileA = randomUUID()
const fileB = randomUUID()

before(async () => {
  await db.$connect()
  await db.user.createMany({
    data: testOwners.map((id) => ({
      id,
      email: `db-test-${id}@formula.test`,
      displayName: '数据库临时测试用户',
    })),
  })
  await db.category.createMany({
    data: [
      { id: categoryA, ownerId: ownerA, name: '同名分类' },
      { id: categoryB, ownerId: ownerB, name: '同名分类' },
    ],
  })
  await db.storedFile.createMany({
    data: [
      {
        id: fileA,
        ownerId: ownerA,
        bucket: 'tests',
        objectKey: `${ownerA}/input.png`,
        name: 'input.png',
        kind: 'IMAGE',
        mimeType: 'image/png',
        sizeBytes: 128,
      },
      {
        id: fileB,
        ownerId: ownerB,
        bucket: 'tests',
        objectKey: `${ownerB}/input.png`,
        name: 'input.png',
        kind: 'IMAGE',
        mimeType: 'image/png',
        sizeBytes: 128,
      },
    ],
  })
})

after(async () => {
  try {
    // 只清理本次创建的 UUID，不触碰开发种子或用户已有资源。
    await db.user.deleteMany({ where: { id: { in: testOwners } } })
  } finally {
    await db.$disconnect()
  }
})

const newFormula = (title: string) =>
  createFormula(db, {
    ownerId: ownerA,
    title,
    latex: 'E = mc^2',
    categoryId: categoryA,
    origin: 'DEMO',
    isMock: true,
  })
const hasCode = (code: string) => (error: unknown) =>
  error instanceof DatabaseOperationError && error.code === code

test('公式与版本真实落库，读取必须显式指定所属用户', async () => {
  const saved = await newFormula('数据库读写')
  const own = await getFormula(db, ownerA, saved.formula.id)
  assert.equal(own?.versions[0]?.latex, 'E = mc^2')
  assert.equal(own?.category?.id, categoryA)
  assert.equal(await getFormula(db, ownerB, saved.formula.id), null)
})

test('追加修订保留原始版本，相同内容不会产生无意义的新版本', async () => {
  const saved = await newFormula('版本保留')
  const revised = await appendFormulaVersion(db, {
    ownerId: ownerA,
    formulaId: saved.formula.id,
    expectedVersionId: saved.version.id,
    latex: 'm = \\frac{E}{c^2}',
  })
  assert.equal(revised.number, 2)
  assert.equal(revised.origin, 'MANUAL')
  const unchanged = await appendFormulaVersion(db, {
    ownerId: ownerA,
    formulaId: saved.formula.id,
    expectedVersionId: revised.id,
    latex: revised.latex,
  })
  assert.equal(unchanged.id, revised.id)
  const stored = await getFormula(db, ownerA, saved.formula.id)
  assert.equal(stored?.versions.length, 2)
  assert.equal(stored?.versions[0]?.latex, 'E = mc^2')
})

test('数据库拒绝直接覆盖任何公式版本', async () => {
  const saved = await newFormula('不可覆盖')
  await assert.rejects(
    db.formulaVersion.update({ where: { id: saved.version.id }, data: { latex: 'overwritten' } }),
  )
  const original = await db.formulaVersion.findUniqueOrThrow({ where: { id: saved.version.id } })
  assert.equal(original.latex, 'E = mc^2')
})

test('旧版本提交会明确冲突，其他用户不能追加版本', async () => {
  const saved = await newFormula('过期编辑')
  await appendFormulaVersion(db, {
    ownerId: ownerA,
    formulaId: saved.formula.id,
    expectedVersionId: saved.version.id,
    latex: 'm=E/c^2',
  })
  await assert.rejects(
    appendFormulaVersion(db, {
      ownerId: ownerA,
      formulaId: saved.formula.id,
      expectedVersionId: saved.version.id,
      latex: 'c^2=E/m',
    }),
    hasCode('VERSION_CONFLICT'),
  )
  await assert.rejects(
    appendFormulaVersion(db, {
      ownerId: ownerB,
      formulaId: saved.formula.id,
      expectedVersionId: saved.version.id,
      latex: 'x=1',
    }),
    hasCode('NOT_FOUND'),
  )
})

test('并发编辑只允许一份旧版本提交成功，不会静默覆盖或重复版本号', async () => {
  const saved = await newFormula('并发编辑')
  const results = await Promise.allSettled(
    ['m=E/c^2', 'c^2=E/m'].map((latex) =>
      appendFormulaVersion(db, {
        ownerId: ownerA,
        formulaId: saved.formula.id,
        expectedVersionId: saved.version.id,
        latex,
      }),
    ),
  )
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  const failure = results.find((result) => result.status === 'rejected')
  assert.ok(failure?.status === 'rejected' && hasCode('VERSION_CONFLICT')(failure.reason))
  const versions = await db.formulaVersion.findMany({
    where: { formulaId: saved.formula.id },
    orderBy: { number: 'asc' },
  })
  assert.deepEqual(
    versions.map((version) => version.number),
    [1, 2],
  )
  assert.equal(versions[0]?.latex, 'E = mc^2')
})

test('组合外键拒绝跨用户分类，创建失败会回滚整个公式事务', async () => {
  const count = await db.formula.count({ where: { ownerId: ownerB } })
  await assert.rejects(
    createFormula(db, {
      ownerId: ownerB,
      title: '非法关联',
      latex: 'x=1',
      categoryId: categoryA,
      origin: 'DEMO',
      isMock: true,
    }),
  )
  assert.equal(await db.formula.count({ where: { ownerId: ownerB } }), count)
})

test('分类名在同一用户内唯一，不同用户可以拥有同名分类', async () => {
  assert.equal(
    await db.category.count({ where: { ownerId: { in: [ownerA, ownerB] }, name: '同名分类' } }),
    2,
  )
  await assert.rejects(db.category.create({ data: { ownerId: ownerA, name: '同名分类' } }))
})

test('任务不能引用他人的文件，每用户请求幂等键不能重复', async () => {
  await assert.rejects(
    db.recognitionTask.create({
      data: { ownerId: ownerB, inputFileId: fileA, requestKey: 'wrong-file', mode: 'PRINTED' },
    }),
  )
  const task = await db.recognitionTask.create({
    data: { ownerId: ownerA, inputFileId: fileA, requestKey: 'same-request', mode: 'HANDWRITTEN' },
  })
  await assert.rejects(
    db.recognitionTask.create({
      data: {
        ownerId: ownerA,
        inputFileId: fileA,
        requestKey: 'same-request',
        mode: 'HANDWRITTEN',
      },
    }),
  )
  await db.recognitionTask.create({
    data: { ownerId: ownerB, inputFileId: fileB, requestKey: 'same-request', mode: 'PRINTED' },
  })
  await assert.rejects(
    db.formula.create({
      data: { ownerId: ownerB, title: '错误任务归属', recognitionTaskId: task.id },
    }),
  )
})

test('一个任务不能生成两条公式，收藏不能跨用户且不会重复', async () => {
  const task = await db.recognitionTask.create({
    data: { ownerId: ownerA, inputFileId: fileA, requestKey: randomUUID(), mode: 'HANDWRITTEN' },
  })
  const saved = await createFormula(db, {
    ownerId: ownerA,
    title: '任务结果约束',
    latex: 'x=1',
    recognitionTaskId: task.id,
    origin: 'DEMO',
    isMock: true,
  })
  await assert.rejects(
    createFormula(db, {
      ownerId: ownerA,
      title: '重复任务结果',
      latex: 'x=2',
      recognitionTaskId: task.id,
      origin: 'DEMO',
      isMock: true,
    }),
  )
  await db.favorite.create({ data: { ownerId: ownerA, formulaId: saved.formula.id } })
  await assert.rejects(
    db.favorite.create({ data: { ownerId: ownerA, formulaId: saved.formula.id } }),
  )
  await assert.rejects(
    db.favorite.create({ data: { ownerId: ownerB, formulaId: saved.formula.id } }),
  )
})

test('对话绑定具体版本，不能跨用户引用或悄悄切换到新版本', async () => {
  const saved = await newFormula('对话上下文')
  const conversation = await db.conversation.create({
    data: { ownerId: ownerA, formulaVersionId: saved.version.id, title: '绑定原始公式' },
  })
  await db.chatMessage.create({
    data: {
      ownerId: ownerA,
      conversationId: conversation.id,
      position: 1,
      role: 'USER',
      content: '请解释公式。',
    },
  })
  await assert.rejects(
    db.conversation.create({
      data: { ownerId: ownerB, formulaVersionId: saved.version.id, title: '跨用户上下文' },
    }),
  )
  await assert.rejects(
    db.chatMessage.create({
      data: {
        ownerId: ownerB,
        conversationId: conversation.id,
        position: 2,
        role: 'USER',
        content: '不能写进他人的会话。',
      },
    }),
  )
  const revised = await appendFormulaVersion(db, {
    ownerId: ownerA,
    formulaId: saved.formula.id,
    expectedVersionId: saved.version.id,
    latex: 'm=E/c^2',
  })
  await assert.rejects(
    db.conversation.update({
      where: { id: conversation.id },
      data: { formulaVersionId: revised.id },
    }),
  )
  const originalContext = await db.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
    include: { messages: true },
  })
  assert.equal(originalContext.formulaVersionId, saved.version.id)
  assert.equal(originalContext.messages[0]?.content, '请解释公式。')
  await db.conversation.update({ where: { id: conversation.id }, data: { title: '标题可以修改' } })
})

test('检查约束拒绝损坏的元数据、无效重试计数和虚假置信度', async () => {
  for (const extra of [
    { sizeBytes: 10 * 1024 * 1024 + 1 },
    { width: 5000, height: 5000 },
    { status: 'READY' as const },
    { mimeType: 'image/svg+xml' },
  ]) {
    await assert.rejects(
      db.storedFile.create({
        data: {
          ownerId: ownerA,
          kind: 'IMAGE',
          bucket: 'tests',
          objectKey: randomUUID(),
          name: 'invalid.png',
          mimeType: 'image/png',
          sizeBytes: 128,
          ...extra,
        },
      }),
    )
  }
  await assert.rejects(
    db.recognitionTask.create({
      data: {
        ownerId: ownerA,
        inputFileId: fileA,
        requestKey: randomUUID(),
        mode: 'HANDWRITTEN',
        attemptCount: 4,
        maxAttempts: 3,
      },
    }),
  )
  await assert.rejects(
    db.recognitionTask.create({
      data: {
        ownerId: ownerA,
        inputFileId: fileA,
        requestKey: randomUUID(),
        mode: 'HANDWRITTEN',
        status: 'COMPLETED',
      },
    }),
  )
  const saved = await newFormula('置信度约束')
  await assert.rejects(
    db.formulaVersion.create({
      data: {
        ownerId: ownerA,
        formulaId: saved.formula.id,
        number: 2,
        latex: 'x=1',
        origin: 'MANUAL',
        isMock: true,
        confidence: 0.99,
      },
    }),
  )
  await assert.rejects(
    db.user.create({
      data: { email: `UPPER-${randomUUID()}@formula.test`, displayName: '未归一化的邮箱' },
    }),
  )
})

test('删除临时用户会级联清理其资源，不受组合归属关系阻碍', async () => {
  const id = randomUUID()
  testOwners.push(id)
  await db.user.create({
    data: { id, email: `db-test-${id}@formula.test`, displayName: '级联清理检查' },
  })
  const category = await db.category.create({ data: { ownerId: id, name: '级联分类' } })
  const file = await db.storedFile.create({
    data: {
      ownerId: id,
      kind: 'IMAGE',
      bucket: 'tests',
      objectKey: randomUUID(),
      name: 'cascade.png',
      mimeType: 'image/png',
      sizeBytes: 1,
    },
  })
  const task = await db.recognitionTask.create({
    data: { ownerId: id, inputFileId: file.id, requestKey: randomUUID(), mode: 'PRINTED' },
  })
  const saved = await createFormula(db, {
    ownerId: id,
    title: '级联公式',
    latex: 'x=1',
    categoryId: category.id,
    recognitionTaskId: task.id,
    origin: 'DEMO',
    isMock: true,
  })
  const conversation = await db.conversation.create({
    data: { ownerId: id, formulaVersionId: saved.version.id, title: '级联对话' },
  })
  await db.chatMessage.create({
    data: {
      ownerId: id,
      conversationId: conversation.id,
      position: 1,
      role: 'USER',
      content: '级联消息',
    },
  })
  await db.favorite.create({ data: { ownerId: id, formulaId: saved.formula.id } })
  await db.user.delete({ where: { id } })
  const counts = await Promise.all([
    db.storedFile.count({ where: { ownerId: id } }),
    db.recognitionTask.count({ where: { ownerId: id } }),
    db.formula.count({ where: { ownerId: id } }),
    db.formulaVersion.count({ where: { ownerId: id } }),
    db.category.count({ where: { ownerId: id } }),
    db.favorite.count({ where: { ownerId: id } }),
    db.conversation.count({ where: { ownerId: id } }),
    db.chatMessage.count({ where: { ownerId: id } }),
  ])
  assert.ok(counts.every((count) => count === 0))
})
