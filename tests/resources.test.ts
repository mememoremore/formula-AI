import { testEnvironment } from './support/integration.ts'
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { createDatabaseClient } from '../server/database/client'
import { createObjectStore, type PrivateObjectStore } from '../server/storage/object-store'
import { resourcePolicy } from '../server/resources/policy'
import { reserveResource, releaseUnbound, resourceTransaction } from '../server/resources/leases'
import { prepareFile, publishFile, putAndPublish } from '../server/resources/files'
import { cleanupFile, reconcileExpiredLeases, scanStorage } from '../server/resources/cleanup'
import { saveProfile } from '../server/services/profile'
import { beginImageUpload, uploadPrivateImage } from '../server/services/image-upload'
import { createQueueClient, queues } from '../server/queue/client'
import { submitRecognition } from '../server/database/task-submissions'
import { defaultUsageLimits } from '../server/database/usage'
import { createFormula } from '../server/database/formulas'
const db = createDatabaseClient(testEnvironment.databaseUrl)
const db2 = createDatabaseClient(testEnvironment.databaseUrl)
const store = createObjectStore({ ...testEnvironment.storage, region: 'us-east-1' })
const boss = createQueueClient(testEnvironment.databaseUrl)
const owners: string[] = []
let png: Buffer
const policy = { ...resourcePolicy(), uploadsPerMinute: 100, ownerUploads: 10, globalUploads: 20 }
async function owner() {
  const user = await db.user.create({
    data: { email: `resources-${randomUUID()}@formula.test`, displayName: 'R12隔离测试' },
  })
  owners.push(user.id)
  return user.id
}
async function pending(ownerId: string, bytes = png, kind: 'IMAGE' | 'DOCX' = 'IMAGE') {
  const lease = await reserveResource(
    db,
    { ownerId, purpose: 'DOCX_WRITE', requestKey: randomUUID(), bytes: bytes.length },
    policy,
  )
  const file = await prepareFile(db, lease, {
    kind,
    bucket: store.bucket,
    objectKey: `${ownerId}/r12/${randomUUID()}`,
    name: 'fixture',
    mimeType:
      kind === 'IMAGE'
        ? 'image/png'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: bytes.length,
    width: kind === 'IMAGE' ? 1 : null,
    height: kind === 'IMAGE' ? 1 : null,
  })
  return { lease, file, bytes }
}
async function ready(ownerId: string, bytes = png, kind: 'IMAGE' | 'DOCX' = 'IMAGE') {
  const state = await pending(ownerId, bytes, kind)
  await putAndPublish(db, store, state.lease, state.file, bytes, async () => {})
  await db.storedFile.update({
    where: { id: state.file.id },
    data: { updatedAt: new Date(Date.now() - 8 * 86400000) },
  })
  return state
}
before(async () => {
  await Promise.all([db.$connect(), db2.$connect(), store.check(), boss.start()])
  png = await sharp({ create: { width: 32, height: 16, channels: 3, background: '#6257e5' } })
    .png()
    .toBuffer()
})
after(async () => {
  try {
    for (const ownerId of owners)
      for (const name of Object.values(queues)) {
        const jobs = await boss.findJobs(name, { data: { ownerId }, limit: 1000 })
        if (jobs.length)
          await boss.deleteJob(
            name,
            jobs.map((job) => job.id),
          )
      }
    // 测试清理仅针对本套 fixture，网络守卫已限制到本次桶。
    const files = await db.storedFile.findMany({ where: { ownerId: { in: owners } } })
    for (const file of files) await store.remove(file.objectKey)
    await db.resourceLease.deleteMany({ where: { ownerId: { in: owners } } })
    await db.user.deleteMany({ where: { id: { in: owners } } })
  } finally {
    await Promise.all([db.$disconnect(), db2.$disconnect(), boss.stop()])
  }
})
test('真实迁移具备有效请求部分唯一索引、非负预留及独立审计约束', async () => {
  const id = await owner()
  const lease = await reserveResource(
    db,
    { ownerId: id, purpose: 'IMAGE_UPLOAD', requestKey: randomUUID(), bytes: 10 },
    policy,
  )
  await assert.rejects(
    db.resourceLease.create({
      data: {
        ownerId: id,
        purpose: lease.purpose,
        requestKey: lease.requestKey,
        executionToken: randomUUID(),
        expiresAt: lease.expiresAt,
      },
    }),
  )
  await assert.rejects(
    db.resourceLease.update({ where: { id: lease.id }, data: { reservedBytes: -1 } }),
  )
  const foreign = await pending(await owner())
  await assert.rejects(
    db.resourceLease.update({
      where: { id: lease.id },
      data: { fileId: foreign.file.id, reservedBytes: 0 },
    }),
  )
  await putAndPublish(db, store, foreign.lease, foreign.file, png, async () => {})
  await releaseUnbound(db, lease)
  const replacement = await reserveResource(
    db,
    { ownerId: id, purpose: lease.purpose, requestKey: lease.requestKey, bytes: 10 },
    policy,
  )
  assert.notEqual(replacement.executionToken, lease.executionToken)
  await releaseUnbound(db, replacement)
})
test('两个独立数据库客户端争夺账号容量仅一个成功，失败无重复预留', async () => {
  const id = await owner()
  const limits = { ...policy, ownerBytes: 100, globalBytes: 100000 }
  const results = await Promise.allSettled(
    [db, db2].map((client) =>
      reserveResource(
        client,
        { ownerId: id, purpose: 'DOCX_WRITE', requestKey: randomUUID(), bytes: 60 },
        limits,
      ),
    ),
  )
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(await db.resourceLease.count({ where: { ownerId: id } }), 1)
  for (const result of results)
    if (result.status === 'fulfilled') await releaseUnbound(db, result.value)
})
test('跨账号全局容量和跨实例上传槽位均受数据库锁保护', async () => {
  const a = await owner(),
    b = await owner()
  const currentFiles = await db.storedFile.aggregate({
    where: { status: { not: 'DELETED' } },
    _sum: { sizeBytes: true },
  })
  const base = currentFiles._sum.sizeBytes ?? 0
  const results = await Promise.allSettled(
    [a, b].map((id, i) =>
      reserveResource(
        i ? db2 : db,
        { ownerId: id, purpose: 'DOCX_WRITE', requestKey: randomUUID(), bytes: 60 },
        { ...policy, globalBytes: base + 100 },
      ),
    ),
  )
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  for (const result of results)
    if (result.status === 'fulfilled') await releaseUnbound(db, result.value)
  const slots = await Promise.allSettled(
    [a, b].map((id, i) =>
      reserveResource(
        i ? db2 : db,
        { ownerId: id, purpose: 'IMAGE_UPLOAD', requestKey: randomUUID(), bytes: 0 },
        { ...policy, globalUploads: 1 },
      ),
    ),
  )
  assert.equal(slots.filter((result) => result.status === 'fulfilled').length, 1)
  for (const result of slots)
    if (result.status === 'fulfilled') await releaseUnbound(db, result.value)
})
test('上传频率与处理槽位分别限制；过期许可不会自动释放占用', async () => {
  const id = await owner()
  const lease = await reserveResource(
    db,
    { ownerId: id, purpose: 'IMAGE_UPLOAD', requestKey: randomUUID(), bytes: 7 },
    { ...policy, ownerUploads: 1, uploadsPerMinute: 1 },
  )
  await assert.rejects(
    reserveResource(
      db2,
      { ownerId: id, purpose: 'IMAGE_UPLOAD', requestKey: randomUUID(), bytes: 0 },
      { ...policy, ownerUploads: 1 },
    ),
    /繁忙/,
  )
  await db.resourceLease.update({ where: { id: lease.id }, data: { expiresAt: new Date(0) } })
  await reconcileExpiredLeases(db)
  const expired = await db.resourceLease.findUniqueOrThrow({ where: { id: lease.id } })
  assert.equal(expired.status, 'REVIEW_REQUIRED')
  assert.equal(expired.reservedBytes, 7n)
  assert.notEqual(expired.executionToken, lease.executionToken)
  await assert.rejects(
    prepareFile(db, lease, {
      kind: 'IMAGE',
      bucket: store.bucket,
      objectKey: randomUUID(),
      name: 'x',
      mimeType: 'image/png',
      sizeBytes: 1,
      width: 1,
      height: 1,
    }),
    /许可/,
  )
  await assert.rejects(
    reserveResource(
      db2,
      { ownerId: id, purpose: 'IMAGE_UPLOAD', requestKey: randomUUID(), bytes: 0 },
      { ...policy, ownerUploads: 1 },
    ),
    /繁忙/,
  )
  // 明确结束本套故障 fixture，避免污染其他用例的全局槽位；不是生产恢复路径。
  await db.resourceLease.update({
    where: { id: lease.id },
    data: { status: 'RELEASED', reservedBytes: 0, finishedAt: new Date() },
  })
  await assert.rejects(
    reserveResource(
      db,
      { ownerId: id, purpose: 'IMAGE_UPLOAD', requestKey: randomUUID(), bytes: 0 },
      { ...policy, uploadsPerMinute: 1 },
    ),
    /频繁/,
  )
})
test('预留转换为PENDING文件不重复计量，实际体积追加不足时先拒绝S3写入', async () => {
  const id = await owner()
  const state = await pending(id)
  const lease = await db.resourceLease.findUniqueOrThrow({ where: { id: state.lease.id } })
  assert.equal(lease.reservedBytes, 0n)
  assert.equal(lease.fileId, state.file.id)
  const old = process.env.FORMULA_RESOURCE_OWNER_BYTES
  process.env.FORMULA_RESOURCE_OWNER_BYTES = String(png.length + 5)
  try {
    const extra = await reserveResource(db, {
      ownerId: id,
      purpose: 'DOCX_WRITE',
      requestKey: randomUUID(),
      bytes: 1,
    })
    await assert.rejects(
      prepareFile(db, extra, {
        kind: 'DOCX',
        bucket: store.bucket,
        objectKey: randomUUID(),
        name: 'x',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 6,
      }),
      /容量/,
    )
    assert.equal(await db.storedFile.count({ where: { ownerId: id } }), 1)
    await releaseUnbound(db, extra)
  } finally {
    if (old === undefined) delete process.env.FORMULA_RESOURCE_OWNER_BYTES
    else process.env.FORMULA_RESOURCE_OWNER_BYTES = old
  }
  await putAndPublish(db, store, state.lease, state.file, png, async () => {})
})
test('成功上传响应丢失后重放返回同一文件，超额配置也不重复预留或创建对象', async () => {
  const id = await owner(),
    input = {
      ownerId: id,
      uploadKey: randomUUID(),
      name: 'x.png',
      mimeType: 'image/png',
      data: png,
    }
  const first = await uploadPrivateImage(db, store, input)
  const old = process.env.FORMULA_RESOURCE_OWNER_BYTES
  process.env.FORMULA_RESOURCE_OWNER_BYTES = '1'
  try {
    assert.equal((await uploadPrivateImage(db2, store, input)).id, first.id)
  } finally {
    if (old === undefined) delete process.env.FORMULA_RESOURCE_OWNER_BYTES
    else process.env.FORMULA_RESOURCE_OWNER_BYTES = old
  }
  assert.equal(await db.storedFile.count({ where: { ownerId: id } }), 1)
  await assert.rejects(
    uploadPrivateImage(db, store, { ...input, data: Buffer.from('different') }),
    /另一张/,
  )
})
test('同账号重复上传请求在读取/解码前拒绝且没有第二份预留', async () => {
  const id = await owner(),
    key = randomUUID()
  const lease = await beginImageUpload(db, id, key)
  await assert.rejects(beginImageUpload(db2, id, key), /仍在处理/)
  assert.equal(await db.resourceLease.count({ where: { ownerId: id, status: 'ACTIVE' } }), 1)
  await releaseUnbound(db, lease)
})
test('S3成功但发布事务回滚时补偿本次对象；补偿失败保留占用供安全重试', async () => {
  for (const failDelete of [false, true]) {
    const id = await owner(),
      state = await pending(id)
    const uploadKey = randomUUID()
    await db.storedFile.update({
      where: { id: state.file.id },
      data: {
        uploadKey,
        contentHash: createHash('sha256').update(png).digest('hex'),
        name: 'retry.png',
      },
    })
    const fault: PrivateObjectStore = {
      ...store,
      remove: failDelete
        ? async () => {
            throw new Error('Injected delete timeout')
          }
        : store.remove,
    }
    await assert.rejects(
      putAndPublish(db, fault, state.lease, state.file, png, async () => {
        throw new Error('Injected database rollback')
      }),
      /rollback/,
    )
    const file = await db.storedFile.findUniqueOrThrow({ where: { id: state.file.id } })
    assert.equal(file.status, failDelete ? 'DELETING' : 'DELETED')
    assert.equal(
      (await db.resourceLease.findUniqueOrThrow({ where: { id: state.lease.id } })).status,
      failDelete ? 'REVIEW_REQUIRED' : 'RELEASED',
    )
    if (failDelete) {
      assert.ok(await store.head!(file.objectKey))
      await db.storedFile.update({ where: { id: file.id }, data: { updatedAt: new Date(0) } })
      assert.equal(
        (await cleanupFile(db, store, file.id, { apply: true, verifiedTestBucket: store.bucket }))
          .outcome,
        'DELETED',
      )
    } else assert.equal(await store.head!(file.objectKey), null)
    const retried = await uploadPrivateImage(db, store, {
      ownerId: id,
      uploadKey,
      name: 'retry.png',
      mimeType: 'image/png',
      data: png,
    })
    assert.equal(retried.id, state.file.id)
    assert.notEqual(
      (await db.storedFile.findUniqueOrThrow({ where: { id: retried.id } })).objectKey,
      state.file.objectKey,
    )
  }
})
test('S3写入后响应超时保持PENDING与核对许可，不自动释放或盲目再上传', async () => {
  const id = await owner(),
    state = await pending(id)
  const uncertain = {
    ...store,
    put: async (key: string, bytes: Buffer, mime: string) => {
      await store.put(key, bytes, mime)
      throw new Error('Injected lost PUT response')
    },
  }
  await assert.rejects(putAndPublish(db, uncertain, state.lease, state.file, png, async () => {}))
  assert.ok(await store.head!(state.file.objectKey))
  assert.equal(
    (await db.storedFile.findUniqueOrThrow({ where: { id: state.file.id } })).status,
    'PENDING',
  )
  assert.equal(
    (await db.resourceLease.findUniqueOrThrow({ where: { id: state.lease.id } })).status,
    'REVIEW_REQUIRED',
  )
  assert.equal(
    (await cleanupFile(db, store, state.file.id, { apply: true, verifiedTestBucket: store.bucket }))
      .outcome,
    'LEASE_REVIEW_KEEP',
  )
})
test('租约超时后旧执行者即使仍完成S3写入也不能发布READY，扫描保留对象', async () => {
  const id = await owner(),
    state = await pending(id)
  await db.resourceLease.update({ where: { id: state.lease.id }, data: { expiresAt: new Date(0) } })
  await reconcileExpiredLeases(db)
  await store.put(state.file.objectKey, png, 'image/png')
  await assert.rejects(
    publishFile(db, state.lease, state.file, async () => {}),
    /许可/,
  )
  assert.equal((await cleanupFile(db, store, state.file.id)).outcome, 'LEASE_REVIEW_KEEP')
})
test('dry-run不删对象；显式隔离apply删除并留独立审计；重复执行幂等', async () => {
  const state = await ready(await owner())
  assert.equal((await cleanupFile(db, store, state.file.id)).outcome, 'DRY_RUN_CANDIDATE')
  assert.ok(await store.head!(state.file.objectKey))
  await assert.rejects(
    cleanupFile(db, store, state.file.id, { apply: true, verifiedTestBucket: 'not-this-bucket' }),
  )
  assert.equal(
    (await cleanupFile(db, store, state.file.id, { apply: true, verifiedTestBucket: store.bucket }))
      .outcome,
    'DELETED',
  )
  assert.equal(
    (await cleanupFile(db, store, state.file.id, { apply: true, verifiedTestBucket: store.bucket }))
      .outcome,
    'ALREADY_DELETED',
  )
  await db.resourceLease.deleteMany({ where: { fileId: state.file.id } })
  await db.storedFile.delete({ where: { id: state.file.id } })
  assert.ok(await db.storageCleanupAudit.count({ where: { fileId: state.file.id } }))
})
test('清理标记之后的并发识别不能引用DELETING文件，也不扣额度或入队', async () => {
  const id = await owner(),
    state = await ready(id)
  let notify!: () => void, proceed!: () => void
  const claimed = new Promise<void>((resolve) => {
      notify = resolve
    }),
    wait = new Promise<void>((resolve) => {
      proceed = resolve
    })
  const paused = {
    ...store,
    remove: async (key: string) => {
      notify()
      await wait
      await store.remove(key)
    },
  }
  const deleting = cleanupFile(db, paused, state.file.id, {
    apply: true,
    verifiedTestBucket: store.bucket,
  })
  await claimed
  try {
    await assert.rejects(
      submitRecognition(db2, boss, defaultUsageLimits, {
        ownerId: id,
        fileId: state.file.id,
        requestKey: randomUUID(),
        mode: 'handwritten',
      }),
      /未找到/,
    )
    assert.equal(await db.dailyUsage.count({ where: { ownerId: id } }), 0)
    assert.equal(await db.recognitionTask.count({ where: { ownerId: id } }), 0)
  } finally {
    proceed()
  }
  assert.equal((await deleting).outcome, 'DELETED')
})
test('识别先取得引用则清理保留；准入竞争不超账号上限，重放优先于已满上限', async () => {
  const id = await owner(),
    state = await ready(id)
  const key = randomUUID(),
    base = { ownerId: id, fileId: state.file.id, mode: 'handwritten' as const }
  const tasks = await Promise.allSettled(
    [db, db2, db].map((client, i) =>
      submitRecognition(client, boss, defaultUsageLimits, {
        ...base,
        requestKey: i === 0 ? key : randomUUID(),
      }),
    ),
  )
  assert.equal(tasks.filter((result) => result.status === 'fulfilled').length, 2)
  assert.equal(await db.recognitionTask.count({ where: { ownerId: id } }), 2)
  assert.equal(
    (await db.dailyUsage.findFirstOrThrow({ where: { ownerId: id, kind: 'RECOGNITION' } })).used,
    2,
  )
  const successful = tasks.find((result) => result.status === 'fulfilled')!
  if (successful.status !== 'fulfilled') throw new Error('No task')
  assert.equal(
    (
      await submitRecognition(db2, boss, defaultUsageLimits, {
        ...base,
        requestKey: successful.value.requestKey,
      })
    ).id,
    successful.value.id,
  )
  assert.equal(
    (await cleanupFile(db, store, state.file.id, { apply: true, verifiedTestBucket: store.bucket }))
      .outcome,
    'REFERENCED_KEEP',
  )
})
test('头像替换先确认数据库；冲突只回滚新对象，旧对象仍可读取（原单元场景升级真实数据库）', async () => {
  for (const conflict of [false, true]) {
    const id = await owner()
    await saveProfile(db, store, id, {
      name: '旧头像',
      avatar: 'data:image/png;base64,' + png.toString('base64'),
    })
    const old = (await db.user.findUniqueOrThrow({ where: { id } })).image!
    const newBytes = await sharp(png).negate().png().toBuffer()
    let newKey = ''
    const events: string[] = []
    const fault = {
      ...store,
      put: async (key: string, bytes: Buffer, mime: string) => {
        newKey = key
        events.push('put')
        assert.ok(await store.head!(old))
        await store.put(key, bytes, mime)
        if (conflict) await db2.user.update({ where: { id }, data: { displayName: '其他窗口' } })
      },
      remove: async (key: string) => {
        const current = await db.user.findUniqueOrThrow({ where: { id } })
        assert.equal(current.image, conflict ? old : newKey)
        events.push(key === old ? 'remove-old' : 'remove-new')
        await store.remove(key)
      },
    }
    const saving = saveProfile(db, fault, id, {
      name: '同学',
      avatar: 'data:image/png;base64,' + newBytes.toString('base64'),
    })
    if (conflict) {
      await assert.rejects(saving, /其他窗口/)
      assert.ok(await store.head!(old))
      assert.equal(await store.head!(newKey), null)
      assert.deepEqual(events, ['put', 'remove-new'])
    } else {
      await saving
      assert.equal(await store.head!(old), null)
      assert.ok(await store.head!(newKey))
      assert.deepEqual(events, ['put', 'remove-old'])
    }
  }
})
test('删除响应丢失继续计量；重试后确认对象缺失再释放，数据库不可用不删对象', async () => {
  const state = await ready(await owner())
  const lost = {
    ...store,
    remove: async (key: string) => {
      await store.remove(key)
      throw new Error('Injected lost DELETE response')
    },
  }
  assert.equal(
    (await cleanupFile(db, lost, state.file.id, { apply: true, verifiedTestBucket: store.bucket }))
      .outcome,
    'REVIEW_REQUIRED',
  )
  assert.equal(
    (await db.storedFile.findUniqueOrThrow({ where: { id: state.file.id } })).status,
    'DELETING',
  )
  await db.storedFile.update({ where: { id: state.file.id }, data: { updatedAt: new Date(0) } })
  assert.equal(
    (await cleanupFile(db, store, state.file.id, { apply: true, verifiedTestBucket: store.bucket }))
      .outcome,
    'DELETED',
  )
  const safe = await ready(await owner())
  let removes = 0
  const unavailable = {
    storedFile: {
      findUnique: async () => {
        throw new Error('Injected database unavailable')
      },
    },
  } as unknown as typeof db
  await assert.rejects(
    cleanupFile(
      unavailable,
      {
        ...store,
        remove: async () => {
          removes++
        },
      },
      safe.file.id,
      { apply: true, verifiedTestBucket: store.bucket },
    ),
  )
  assert.equal(removes, 0)
  assert.ok(await store.head!(safe.file.objectKey))
})
test('当前头像及仍可下载的DOCX即使很旧也不能清理，扫描区分缺失和未知对象', async () => {
  const id = await owner()
  await saveProfile(db, store, id, {
    name: '有效头像',
    avatar: 'data:image/png;base64,' + png.toString('base64'),
  })
  const avatar = await db.storedFile.findFirstOrThrow({ where: { ownerId: id, kind: 'AVATAR' } })
  await db.storedFile.update({ where: { id: avatar.id }, data: { updatedAt: new Date(0) } })
  assert.equal(
    (await cleanupFile(db, store, avatar.id, { apply: true, verifiedTestBucket: store.bucket }))
      .outcome,
    'REFERENCED_KEEP',
  )
  const docx = await ready(id, Buffer.from('isolated-docx-reference-fixture'), 'DOCX')
  const formula = await createFormula(db, {
    ownerId: id,
    title: '固定版本',
    latex: 'x=1',
    origin: 'DEMO',
    isMock: true,
  })
  await db.exportTask.create({
    data: {
      ownerId: id,
      formulaVersionId: formula.version.id,
      title: '固定版本',
      requestKey: randomUUID(),
      fileId: docx.file.id,
      status: 'COMPLETED',
      finishedAt: new Date(),
    },
  })
  assert.equal(
    (await cleanupFile(db, store, docx.file.id, { apply: true, verifiedTestBucket: store.bucket }))
      .outcome,
    'REFERENCED_KEEP',
  )
  assert.ok(await store.head!(docx.file.objectKey))
  const missing = await ready(id)
  await store.remove(missing.file.objectKey)
  const unknown = `${id}/unknown-${randomUUID()}`
  await store.put(unknown, png, 'image/png')
  try {
    const findings = await scanStorage(db, store)
    assert.ok(findings.some((f) => f.fileId === missing.file.id && f.state === 'MISSING_OBJECT'))
    assert.ok(findings.some((f) => f.state === 'UNKNOWN_OBJECT_REVIEW_KEEP'))
    await writeFile('tmp/r12-dry-run.json', JSON.stringify({ mode: 'dry-run', findings }, null, 2))
  } finally {
    await store.remove(unknown)
  }
})

test('全局识别准入跨账号竞争只接收一个剩余名额，拒绝方无任务和额度', async () => {
  const a = await owner(),
    b = await owner(),
    one = await ready(a),
    two = await ready(b)
  const existing = await db.recognitionTask.count({
    where: { status: { in: ['QUEUED', 'PROCESSING'] } },
  })
  const old = process.env.FORMULA_RESOURCE_GLOBAL_RECOGNITIONS
  process.env.FORMULA_RESOURCE_GLOBAL_RECOGNITIONS = String(existing + 1)
  try {
    const results = await Promise.allSettled(
      [
        { ownerId: a, fileId: one.file.id },
        { ownerId: b, fileId: two.file.id },
      ].map((value, index) =>
        submitRecognition(index ? db2 : db, boss, defaultUsageLimits, {
          ...value,
          requestKey: randomUUID(),
          mode: 'handwritten',
        }),
      ),
    )
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(await db.recognitionTask.count({ where: { ownerId: { in: [a, b] } } }), 1)
    assert.equal(
      (
        await db.dailyUsage.aggregate({
          where: { ownerId: { in: [a, b] }, kind: 'RECOGNITION' },
          _sum: { used: true },
        })
      )._sum.used,
      1,
    )
  } finally {
    if (old === undefined) delete process.env.FORMULA_RESOURCE_GLOBAL_RECOGNITIONS
    else process.env.FORMULA_RESOURCE_GLOBAL_RECOGNITIONS = old
  }
})

test('HEAD权限/网络错误不当作对象不存在，不修改状态或执行删除', async () => {
  const state = await ready(await owner())
  let deletes = 0
  const denied = {
    ...store,
    head: async () => {
      throw new Error('Injected HEAD forbidden')
    },
    remove: async () => {
      deletes++
    },
  }
  await assert.rejects(
    cleanupFile(db, denied, state.file.id, { apply: true, verifiedTestBucket: store.bucket }),
    /forbidden/,
  )
  assert.equal(deletes, 0)
  assert.equal(
    (await db.storedFile.findUniqueOrThrow({ where: { id: state.file.id } })).status,
    'READY',
  )
})

test('数据库提交已成功但返回结果丢失时补偿不能删除READY成品', async () => {
  const state = await pending(await owner())
  let injected = false
  const fault = new Proxy(db, {
    get(target, key) {
      if (key === '$transaction')
        return async (
          callback: (
            tx: import('../server/resources/leases').ResourceTransaction,
          ) => Promise<unknown>,
          options?: { timeout?: number },
        ) => {
          const result = await target.$transaction(callback, options)
          if (result === 'publication-committed' && !injected) {
            injected = true
            throw new Error('Injected lost transaction response')
          }
          return result
        }
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  await assert.rejects(
    putAndPublish(fault, store, state.lease, state.file, png, async () => 'publication-committed'),
    /lost transaction/,
  )
  assert.equal(injected, true)
  assert.equal(
    (await db.storedFile.findUniqueOrThrow({ where: { id: state.file.id } })).status,
    'READY',
  )
  assert.equal(
    (await db.resourceLease.findUniqueOrThrow({ where: { id: state.lease.id } })).status,
    'RELEASED',
  )
  assert.ok(await store.head!(state.file.objectKey))
})

test('真实子进程在预留后和PUT后退出，跨进程读取仍保留占用并进入核对', async () => {
  const { spawnSync } = await import('node:child_process')
  const { resolve } = await import('node:path')
  for (const stage of ['reserved', 'put']) {
    const id = await owner()
    const child = spawnSync(
      process.execPath,
      ['--import=tsx', resolve('tests/support/resource-crash-fixture.ts'), id, stage],
      { env: { ...process.env }, stdio: 'pipe', windowsHide: true, timeout: 20000 },
    )
    assert.equal(child.status, 17, '故障子进程必须成功提交 fixture 后按约定退出')
    const lease = await db2.resourceLease.findFirstOrThrow({ where: { ownerId: id } })
    assert.equal(lease.status, 'ACTIVE')
    if (stage === 'reserved') {
      assert.equal(lease.fileId, null)
      assert.ok(lease.reservedBytes > 0n)
    } else {
      assert.ok(lease.fileId)
      const file = await db2.storedFile.findUniqueOrThrow({ where: { id: lease.fileId } })
      assert.equal(file.status, 'PENDING')
      assert.ok(await store.head!(file.objectKey))
      assert.equal(lease.reservedBytes, 0n)
    }
    await db.resourceLease.update({ where: { id: lease.id }, data: { expiresAt: new Date(0) } })
    await reconcileExpiredLeases(db)
    const reviewed = await db2.resourceLease.findUniqueOrThrow({ where: { id: lease.id } })
    assert.equal(reviewed.status, 'REVIEW_REQUIRED')
    assert.equal(reviewed.reservedBytes, lease.reservedBytes)
    if (stage === 'reserved') {
      const findings = await scanStorage(db, store)
      assert.ok(
        findings.some(
          (finding) =>
            finding.leaseId === lease.id && finding.state === 'UNBOUND_LEASE_REVIEW_KEEP',
        ),
      )
      // 子进程已经退出，本套 fixture 的人工结束不作为自动生产恢复规则。
      await db.resourceLease.update({
        where: { id: lease.id },
        data: { status: 'RELEASED', reservedBytes: 0, finishedAt: new Date() },
      })
    }
  }
})
