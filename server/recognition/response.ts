import { z } from 'zod'
import { InferenceFailure } from '../inference/failure'

/** Python-specific wire format; extra fields are accepted but never copied into business results. */
export const pythonRecognitionEnvelopeSchema = z.object({}).catchall(z.unknown())
const latex = z
  .string()
  .transform((value) => value.trim())
  .refine(
    (value) =>
      !!value &&
      value.length <= 5000 &&
      !value.includes('```') &&
      !value.includes('\\documentclass') &&
      !value.includes('\0'),
  )
const responseSchema = (requestId: string) =>
  z
    .object({
      requestId: z.literal(requestId),
      latex,
      modelVersion: z.string().regex(/^[a-zA-Z0-9._/:@+-]{1,160}$/),
    })
    .transform((value) => ({ ...value, isMock: false as const }))
export function parsePythonRecognitionResult(input: unknown, requestId: string) {
  const result = responseSchema(requestId).safeParse(input)
  if (!result.success)
    throw new InferenceFailure('UPSTREAM', '识别服务未返回有效的公式或模型版本。', false)
  return result.data
}
