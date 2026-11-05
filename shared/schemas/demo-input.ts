import { z } from 'zod'

// These legacy metadata-only endpoints have different contracts from account tasks.
const text = (max: number, error: string) =>
  z.string({ error }).refine((value) => !!value.trim() && value.length <= max, { error })
const imageError = '请提供图片信息。'
export const demoImageMetadataSchema = z.object(
  {
    name: text(255, '图片名称无效。'),
    mimeType: z.enum(['image/jpeg', 'image/png'], { error: '仅支持 JPEG 和 PNG。' }),
    size: z
      .number({ error: '图片大小必须在 0～10MB 之间。' })
      .refine((value) => Number.isInteger(value) && value > 0 && value <= 10 * 1024 * 1024, {
        error: '图片大小必须在 0～10MB 之间。',
      }),
  },
  { error: imageError },
)
export const demoRecognitionInputSchema = z
  .object(
    {
      image: z.object({}, { error: imageError }).catchall(z.unknown()),
    },
    { error: imageError },
  )
  .catchall(z.unknown())
  .pipe(
    z.object({
      // Root/image checks precede mode; mode precedes image fields, as in the old API.
      mode: z.enum(['handwritten', 'printed'], { error: '识别模式无效。' }),
      image: demoImageMetadataSchema,
    }),
  )

const messageError = '消息格式无效或超过 2000 字。'
const contextError = '公式版本信息无效。'
const historyError = '对话需要包含 1～20 条消息。'
export const demoChatMessageSchema = z.object(
  {
    role: z.enum(['user', 'assistant'], { error: messageError }),
    content: text(2000, messageError),
  },
  { error: messageError },
)
export const demoFormulaContextSchema = z.object(
  {
    versionId: text(100, contextError),
    latex: text(5000, contextError),
  },
  { error: contextError },
)
export const demoChatInputSchema = z
  .object(
    {
      // Count before parsing members. Context cannot override an invalid history error.
      messages: z.custom<unknown[]>(
        (value) => Array.isArray(value) && value.length >= 1 && value.length <= 20,
        { error: historyError },
      ),
    },
    { error: historyError },
  )
  .catchall(z.unknown())
  .pipe(
    z.object({
      messages: z.array(demoChatMessageSchema).transform((value, context) => {
        if (value.at(-1)?.role !== 'user') {
          context.addIssue({ code: 'custom', message: '最后一条消息必须是你的提问。' })
          return z.NEVER
        }
        return value
      }),
      formula: demoFormulaContextSchema.optional(),
    }),
  )
