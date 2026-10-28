import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { parseProfileUpdate, isAvatarKey, accountAvatarUrl } from '../server/services/profile-input'
import { normalizeAvatar } from '../server/images/avatar'
import { avatarCrop } from '../shared/avatar-crop'
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
