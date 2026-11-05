import { pythonRecognitionEnvelopeSchema, parsePythonRecognitionResult } from './response'
import { currentTraceparent, traced } from '../diagnostics/tracing'
import { SpanKind } from '@opentelemetry/api'
import { randomUUID } from 'node:crypto'
import type { RecognitionAdapter } from '../services/recognition-adapter'
import type { RecognitionSettings } from './settings'
import { InferenceFailure, inferenceFailure } from '../inference/failure'

const MAX_RESPONSE_BYTES = 32 * 1024

async function readResult(response: Response): Promise<Record<string, unknown>> {
  if (!response.headers.get('content-type')?.includes('application/json') || !response.body)
    throw new InferenceFailure('UPSTREAM', '识别服务响应格式无效。', false)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_RESPONSE_BYTES)
        throw new InferenceFailure('UPSTREAM', '识别服务响应超出限制。', false)
      chunks.push(value)
    }
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const envelope = pythonRecognitionEnvelopeSchema.safeParse(parsed)
    if (!envelope.success) throw new Error('Invalid response')
    return envelope.data
  } catch (error) {
    if (error instanceof InferenceFailure) throw error
    throw new InferenceFailure('UPSTREAM', '识别服务响应无法解析。', false)
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** HTTP库不重试；队列负责有限重试，统一期限负责取消。 */
export function createPythonRecognitionAdapter(settings: RecognitionSettings): RecognitionAdapter {
  return {
    async recognize(input, signal) {
      return traced(
        'recognition.python',
        async () => {
          signal?.throwIfAborted()
          const requestId = input.requestId ?? randomUUID()
          const body = new FormData()
          const extension = input.mimeType === 'image/png' ? 'png' : 'jpg'
          body.set(
            'image',
            new Blob([new Uint8Array(input.image)], { type: input.mimeType }),
            `formula.${extension}`,
          )
          body.set('mode', input.mode)
          try {
            const response = await fetch(`${settings.serviceUrl}/recognize`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${settings.apiKey}`,
                'X-Request-Id': requestId,
                ...(currentTraceparent() ? { traceparent: currentTraceparent()! } : {}),
              },
              body,
              signal,
              redirect: 'error',
            })
            if (!response.ok) {
              await response.body?.cancel()
              throw inferenceFailure({ status: response.status })
            }
            const result = await readResult(response)
            return parsePythonRecognitionResult(result, requestId)
          } catch (error) {
            if (signal?.aborted) throw signal.reason
            throw inferenceFailure(error)
          }
        },
        { kind: SpanKind.CLIENT },
      )
    },
  }
}
