import type { Readable } from 'node:stream'
export class BodyReadError extends Error {
  constructor(public readonly kind: 'TOO_LARGE' | 'TIMEOUT' | 'EMPTY') {
    super(kind)
  }
}
/** 与 HTTP 解耦的有界读取；超时销毁流，超大流停止收集并交还调用方处理连接。 */
export async function readBoundedStream(stream: Readable, maxBytes: number, deadlineMs: number) {
  const chunks: Buffer[] = []
  let size = 0,
    timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    stream.destroy(new BodyReadError('TIMEOUT'))
  }, deadlineMs)
  timer.unref()
  try {
    for await (const value of stream.iterator({ destroyOnReturn: false })) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
      size += chunk.length
      if (size > maxBytes) throw new BodyReadError('TOO_LARGE')
      chunks.push(chunk)
    }
    if (!size) throw new BodyReadError('EMPTY')
    return Buffer.concat(chunks, size)
  } catch (error) {
    if (timedOut) throw new BodyReadError('TIMEOUT')
    throw error
  } finally {
    clearTimeout(timer)
    chunks.length = 0
  }
}
