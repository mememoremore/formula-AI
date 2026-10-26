import { recognizeMock } from '../services/mock-recognition'
import { invalidInput, isRecord, isText } from '../utils/validate-body'

export default defineEventHandler(async (event) => {
  // This is a metadata-only demo API, never an image upload endpoint.
  const body: unknown = await readBody(event)
  if (!isRecord(body) || !isRecord(body.image)) invalidInput('请提供图片信息。')
  if (body.mode !== 'handwritten' && body.mode !== 'printed') invalidInput('识别模式无效。')
  const image = body.image
  if (!isText(image.name, 255)) invalidInput('图片名称无效。')
  if (image.mimeType !== 'image/jpeg' && image.mimeType !== 'image/png')
    invalidInput('仅支持 JPEG 和 PNG。')
  if (
    typeof image.size !== 'number' ||
    !Number.isInteger(image.size) ||
    image.size <= 0 ||
    image.size > 10 * 1024 * 1024
  ) {
    invalidInput('图片大小必须在 0～10MB 之间。')
  }
  return recognizeMock()
})
