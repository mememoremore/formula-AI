import sharp from 'sharp'
import { formulaPng } from './formula-renderer'

export async function formulaClipboardImage(formulas: string[]) {
  const layers: { input: Buffer; left: number; top: number }[] = []
  const gap = 24,
    padding = 24
  let width = 0,
    height = padding
  const sizes: { data: Buffer; width: number; height: number }[] = []

  for (const formula of formulas) {
    const rendered = await formulaPng(formula)
    const metadata = await sharp(rendered.data).metadata()
    if (!metadata.width || !metadata.height) throw new Error('公式图片无法生成。')
    width = Math.max(width, metadata.width)
    height += metadata.height + gap
    if (width > 8000 || height > 16000 || (width + padding * 2) * height > 16_000_000)
      throw new Error('所选公式过多或过长，请分次复制。')
    sizes.push({ data: rendered.data, width: metadata.width, height: metadata.height })
  }
  if (!sizes.length) throw new Error('请选择公式。')
  width += padding * 2
  let top = padding
  for (const image of sizes) {
    layers.push({ input: image.data, left: Math.floor((width - image.width) / 2), top })
    top += image.height + gap
  }
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite(layers)
    .png()
    .toBuffer()
}
