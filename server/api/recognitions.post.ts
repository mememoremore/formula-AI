import { demoRecognitionInputSchema } from '../../shared/schemas/demo-input'
import { recognizeMock } from '../services/mock-recognition'
import { invalidInput } from '../utils/validate-body'

export default defineEventHandler(async (event) => {
  // Metadata-only demo API, never an image upload endpoint.
  const input = demoRecognitionInputSchema.safeParse(await readBody(event))
  if (!input.success) invalidInput(input.error.issues[0]?.message ?? '请提供图片信息。')
  return recognizeMock()
})
