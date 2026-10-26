import sharp from 'sharp'
import { WorkspaceError } from '../services/workspace-error'
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 20_000_000

/** 完整解码后重编码：验证内容、自动校正方向、移除 EXIF/GPS 等元数据。 */
export async function normalizeImage(input: Buffer, declaredMime: string) {
  if (!input.length || input.length > MAX_IMAGE_BYTES)
    throw new WorkspaceError(413, '图片不能为空，且不能超过 10MB。')
  const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff
  const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const mimeType = jpeg ? 'image/jpeg' : png ? 'image/png' : ''
  if (!mimeType || declaredMime !== mimeType)
    throw new WorkspaceError(415, '图片内容与格式不符，请选择真实的 JPEG 或 PNG 图片。')
  try {
    const image = sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning' })
    const metadata = await image.metadata()
    if ((metadata.pages ?? 1) !== 1)
      throw new WorkspaceError(400, '暂不支持多帧图片，请使用静态 JPEG 或 PNG。')
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS)
      throw new WorkspaceError(413, '图片不能超过 2000 万像素。')
    const oriented = image.autoOrient()
    const { data, info } = await (
      jpeg ? oriented.jpeg({ quality: 95 }) : oriented.png({ compressionLevel: 9 })
    ).toBuffer({ resolveWithObject: true })
    if (data.length > MAX_IMAGE_BYTES)
      throw new WorkspaceError(413, '图片校正后超过 10MB，请缩小图片后重试。')
    return {
      data,
      mimeType,
      width: info.width,
      height: info.height,
      extension: jpeg ? 'jpg' : 'png',
    }
  } catch (error) {
    if (error instanceof WorkspaceError) throw error
    if (error instanceof Error && /pixel limit/i.test(error.message))
      throw new WorkspaceError(413, '图片不能超过 2000 万像素。')
    throw new WorkspaceError(400, '图片无法完整解码，请换一张完整的图片。')
  }
}
