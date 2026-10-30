import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createEnvironment } from './test-environment'
import { cleanupEnvironment } from './test-cleanup'
import { loadTestManifest, inspectTestContainers } from '../tests/support/test-runtime'
import { createDatabaseClient } from '../server/database/client'
import { readRecognitionHistory } from '../server/database/task-queries'

let manifest: string | undefined
try {
  manifest = await createEnvironment((path) => {
    manifest = path
  })
  process.env.FORMULA_TEST_MANIFEST = manifest
  const env = loadTestManifest()
  inspectTestContainers(env)
  const db = createDatabaseClient(env.databaseUrl)
  try {
    const owner = await db.user.create({
      data: { email: 'history-a@example.test', displayName: 'A' },
    })
    const other = await db.user.create({
      data: { email: 'history-b@example.test', displayName: 'B' },
    })
    async function add(ownerId: string, title: string, filename: string, index: number) {
      const file = await db.storedFile.create({
        data: {
          ownerId,
          kind: 'IMAGE',
          bucket: 'test',
          objectKey: randomUUID(),
          name: filename,
          mimeType: 'image/png',
          sizeBytes: 10,
        },
      })
      const task = await db.recognitionTask.create({
        data: {
          ownerId,
          inputFileId: file.id,
          requestKey: randomUUID(),
          mode: 'PRINTED',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      })
      const formula = await db.formula.create({
        data: {
          ownerId,
          title,
          recognitionTaskId: task.id,
        },
      })
      await db.formulaVersion.createMany({
        data: [
          {
            ownerId,
            formulaId: formula.id,
            number: 1,
            latex: 'OldOnlyToken',
            origin: 'RECOGNITION',
            isMock: true,
          },
          {
            ownerId,
            formulaId: formula.id,
            number: 2,
            latex: index === 0 ? 'NewOnlyToken_100%' : 'x+1',
            origin: 'MANUAL',
            isMock: true,
          },
        ],
      })
      return { task, formula }
    }
    let first: Awaited<ReturnType<typeof add>> | undefined
    for (let i = 0; i < 27; i++) {
      const row = await add(owner.id, i === 0 ? '匹配标题_100%' : '匹配标题', 'input.png', i)
      if (i === 0) first = row
    }
    await add(other.id, '匹配标题 foreign', 'foreign.png', 1)
    const firstPage = await readRecognitionHistory(db, owner.id, undefined, '匹配标题')
    assert.equal(firstPage.items.length, 25)
    assert.ok(firstPage.nextCursor)
    const secondPage = await readRecognitionHistory(db, owner.id, firstPage.nextCursor!, '匹配标题')
    assert.equal(secondPage.items.length, 2)
    assert.equal(new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)).size, 27)
    assert.equal(
      (await readRecognitionHistory(db, owner.id, undefined, 'NewOnlyToken_100%')).items[0]?.id,
      first!.task.id,
    )
    assert.equal(
      (await readRecognitionHistory(db, owner.id, undefined, 'OldOnlyToken')).items.length,
      0,
    )
    assert.equal((await readRecognitionHistory(db, owner.id, undefined, 'foreign')).items.length, 0)
    assert.equal(
      (await readRecognitionHistory(db, owner.id, undefined, '标题_100%')).items.length,
      1,
    )
    await db.formula.update({ where: { id: first!.formula.id }, data: { deletedAt: new Date() } })
    const hidden = await readRecognitionHistory(db, owner.id, undefined, 'input.png')
    assert.equal(hidden.items[0]?.id, first!.task.id)
    assert.equal(hidden.items[0]?.formulaId, null)
    assert.equal(
      (await readRecognitionHistory(db, owner.id, undefined, 'NewOnlyToken')).items.length,
      0,
    )
    console.log('隔离搜索测试通过：分页、特殊字符、最新版本、删除和账号隔离')
  } finally {
    await db.$disconnect()
  }
} finally {
  if (manifest) console.log(`测试容器清理：${cleanupEnvironment(manifest)} 个`)
}
