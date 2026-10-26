import type { H3Event } from 'h3'

/** 逐块计数，也限制未提供 Content-Length 的请求；超限后丢弃后续内容。 */
export async function readLimitedBody(event: H3Event, maxBytes: number) {
  const declaredSize = Number(getHeader(event, 'content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    setResponseHeader(event, 'Connection', 'close')
    event.node.req.resume()
    throw createError({ statusCode: 413, message: '上传内容过大，请缩小后重试。' })
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const value of event.node.req.iterator({ destroyOnReturn: false })) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
    size += chunk.length
    if (size > maxBytes) {
      setResponseHeader(event, 'Connection', 'close')
      event.node.req.resume()
      throw createError({ statusCode: 413, message: '上传内容过大，请缩小后重试。' })
    }
    chunks.push(chunk)
  }
  if (!size) throw createError({ statusCode: 400, message: '上传内容不能为空。' })
  return Buffer.concat(chunks, size)
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
