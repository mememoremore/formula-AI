import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { parseProfileUpdate, isAvatarKey, accountAvatarUrl } from '../server/services/profile-input'
import { normalizeAvatar } from '../server/images/avatar'
import { avatarCrop } from '../shared/avatar-crop'
import { saveProfile } from '../server/services/profile'
import type { PrismaClient } from '../server/generated/prisma/client'
test('资料只接受有效昵称与内嵌图片，不接受远程 URL', () => {
  assert.deepEqual(parseProfileUpdate({ name: ' 同学 ', avatar: null }), {
    name: '同学',
    avatar: null,
  })
  assert.throws(() => parseProfileUpdate({ name: ' ' }))
  assert.throws(() => parseProfileUpdate({ name: '同学', avatar: 'https://evil.test/a.png' }))
  assert.equal(
    isAvatarKey(
      'avatars/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.webp',
      '33333333-3333-3333-3333-333333333333',
    ),
    false,
  )
  assert.equal(accountAvatarUrl('https://evil.test/a.png', 'owner'), null)
})
test('头像重新编码成512方形WebP，不信任客户端声明', async () => {
  const input = await sharp({
    create: { width: 80, height: 120, channels: 3, background: '#6257e5' },
  })
    .png()
    .toBuffer()
  const output = await normalizeAvatar('data:image/png;base64,' + input.toString('base64'))
  const metadata = await sharp(output).metadata()
  assert.equal(metadata.width, 512)
  assert.equal(metadata.height, 512)
  assert.equal(metadata.format, 'webp')
  assert.equal(metadata.exif, undefined)
  await assert.rejects(() => normalizeAvatar('data:image/jpeg;base64,' + input.toString('base64')))
})

test('头像替换先确认数据库，再清理旧对象；冲突只回滚新对象', async () => {
  const owner = '11111111-1111-4111-8111-111111111111',
    old = 'avatars/' + owner + '/22222222-2222-4222-8222-222222222222.webp'
  const bytes = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#683fff' },
  })
    .png()
    .toBuffer()
  for (const conflict of [false, true]) {
    const events: string[] = [],
      objects = new Set([old])
    // 仅实现服务真正使用的两个 Prisma 方法，验证业务顺序；并非数据库联调。
    const db = {
      user: {
        findUniqueOrThrow: async () => ({ image: old, updatedAt: new Date(0) }),
        updateMany: async () => {
          events.push('update')
          assert.ok(objects.has(old))
          return { count: conflict ? 0 : 1 }
        },
      },
    } as unknown as PrismaClient
    const store = {
      bucket: 'fixture',
      put: async (key: string) => {
        objects.add(key)
        events.push('put')
      },
      remove: async (key: string) => {
        objects.delete(key)
        events.push(key === old ? 'remove-old' : 'remove-new')
      },
      get: async () => Buffer.alloc(0),
      check: async () => {},
    }
    const saving = saveProfile(db, store, owner, {
      name: '同学',
      avatar: 'data:image/png;base64,' + bytes.toString('base64'),
    })
    if (conflict) {
      await assert.rejects(saving, /其他窗口/)
      assert.deepEqual(events, ['put', 'update', 'remove-new'])
      assert.deepEqual([...objects], [old])
    } else {
      await saving
      assert.deepEqual(events, ['put', 'update', 'remove-old'])
      assert.equal(objects.size, 1)
      assert.equal(objects.has(old), false)
    }
  }
})
test('任意拖动和缩放都不会裁出空白区域', () => {
  for (const [w, h] of [
    [200, 800],
    [800, 200],
    [512, 512],
  ])
    for (const z of [1, 2, 3]) {
      const c = avatarCrop(w!, h!, z, 10000, -10000)
      assert.ok(c.x <= 0 && c.y <= 0)
      assert.ok(c.x + c.width >= 320 && c.y + c.height >= 320)
    }
})
