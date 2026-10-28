import type { H3Event } from 'h3'
import { resourcePolicy } from '../resources/policy'
import { readBoundedStream, BodyReadError } from '../resources/body'
export async function readLimitedBody(event: H3Event, maxBytes: number) {
  const req = event.node.req
  const tooLarge = () => {
    setResponseHeader(event, 'Connection', 'close')
    req.resume()
    return createError({ statusCode: 413, message: '上传内容过大，请缩小后重试。' })
  }
  const declaredSize = Number(getHeader(event, 'content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) throw tooLarge()
  try {
    return await readBoundedStream(req, maxBytes, resourcePolicy().bodySeconds * 1000)
  } catch (error) {
    if (!(error instanceof BodyReadError)) throw error
    if (error.kind === 'TOO_LARGE') throw tooLarge()
    if (error.kind === 'TIMEOUT')
      throw createError({ statusCode: 408, message: '上传读取超时，请安全重试。' })
    throw createError({ statusCode: 400, message: '上传内容不能为空。' })
  }
}
export async function readWorkspaceJson(event: H3Event) {
  if (getHeader(event, 'content-type')?.split(';')[0] !== 'application/json')
    throw createError({ statusCode: 415, message: '请求需要使用 JSON 格式。' })
  const body = await readLimitedBody(event, 32 * 1024)
  try {
    return JSON.parse(body.toString('utf8')) as unknown
  } catch {
    throw createError({ statusCode: 400, message: '请求内容不是有效的 JSON。' })
  }
}
