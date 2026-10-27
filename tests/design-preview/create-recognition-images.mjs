import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

// 仅合成浏览器测试图片；输出限于 tmp，不使用用户图片或外部素材。
const directory = resolve('tmp/r7-images')
await mkdir(directory, { recursive: true })
for (const [name, width, height] of [
  ['横图', 1200, 360],
  ['长图', 320, 1800],
  ['普通', 640, 480],
  ['超像素', 5000, 4100],
]) {
  await sharp({ create: { width, height, channels: 3, background: '#fffaf2' } })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="${height}"><text x="30" y="100" font-size="32" fill="#302b55">x² − 5x + 6 = 0</text></svg>`,
        ),
      },
    ])
    .png()
    .toFile(resolve(directory, name + '.png'))
}
for (const [name, content] of [
  ['损坏.png', 'not an image'],
  ['类型.txt', 'x'],
  ['空.png', ''],
  ['超大小.png', Buffer.alloc(10 * 1024 * 1024 + 1)],
])
  await writeFile(resolve(directory, name), content)
console.log('R7 测试图片已合成至 tmp/r7-images；未使用业务资源。')
