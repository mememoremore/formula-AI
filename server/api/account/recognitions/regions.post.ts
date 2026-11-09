import { requireAccountWriter } from '../../../utils/auth'
import { readLimitedBody } from '../../../utils/request-body'
import { normalizeImage } from '../../../images/normalize-image'
import { readRecognitionSettings } from '../../../recognition/settings'
import { z } from 'zod'

const responseSchema = z.object({
  imageWidth: z.number().int().positive().max(20000000),
  imageHeight: z.number().int().positive().max(20000000),
  regions: z
    .array(
      z.object({
        index: z.number().int().min(0).max(19),
        bbox: z.tuple([
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
          z.number().int().positive(),
          z.number().int().positive(),
        ]),
        imageBase64: z.string().max(14 * 1024 * 1024),
      }),
    )
    .min(1)
    .max(20),
})
export default defineEventHandler(async (event) => {
  await requireAccountWriter(event)
  const mime = getHeader(event, 'content-type')?.split(';')[0] ?? ''
  const normalized = await normalizeImage(await readLimitedBody(event, 10 * 1024 * 1024), mime)
  const settings = readRecognitionSettings(process.env)
  if (settings.provider !== 'python')
    throw createError({ statusCode: 503, message: '多公式检测需要启用真实识别服务。' })
  const body = new FormData()
  body.set(
    'image',
    new Blob([new Uint8Array(normalized.data)], { type: normalized.mimeType }),
    'formulas.png',
  )
  const response = await fetch(settings.serviceUrl + '/regions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + settings.apiKey },
    body,
    signal: AbortSignal.timeout(60000),
    redirect: 'error',
  })
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as { detail?: string } | null
    throw createError({
      statusCode: response.status === 422 ? 422 : 503,
      message:
        response.status === 422 && typeof failure?.detail === 'string'
          ? failure.detail
          : '公式区域检测暂时不可用，请稍后重试。',
    })
  }
  const reader = response.body?.getReader()
  if (!reader) throw createError({ statusCode: 502, message: '检测结果为空。' })
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 22 * 1024 * 1024)
        throw createError({ statusCode: 502, message: '检测结果过大，请缩小图片。' })
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return responseSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
})
