import { z } from 'zod'
import { resourceIdPattern } from '../resource-id'
const id = z
  .string()
  .regex(resourceIdPattern)
  .transform((value) => value.toLowerCase())
export const recognitionBatchInputSchema = z
  .object({
    requestKey: id,
    mode: z.enum(['single', 'multiple']),
    images: z
      .array(
        z.object({
          fileId: id,
          parts: z
            .array(z.object({ fileId: id }))
            .min(1)
            .max(20),
        }),
      )
      .min(1)
      .max(10),
  })
  .superRefine((value, ctx) => {
    value.images.forEach((image, index) => {
      if (value.mode === 'single' ? image.parts.length !== 1 : image.parts.length < 2)
        ctx.addIssue({
          code: 'custom',
          path: ['images', index, 'parts'],
          message:
            value.mode === 'single'
              ? '单公式模式每张图片只能有一个区域。'
              : '多公式模式每张图片至少选择两个区域，不能混合模式。',
        })
    })
  })
export type RecognitionBatchInput = z.output<typeof recognitionBatchInputSchema>
export const recognitionBatchRetrySchema = z.object({
  failed: z.array(z.object({ id, taskId: id.nullable() })).max(200),
})
export const recognitionBatchCategorySchema = z.object({
  ids: z
    .array(id)
    .min(1)
    .max(200)
    .transform((values) => [...new Set(values)]),
  categoryId: id.nullable(),
})
