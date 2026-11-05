import { z } from 'zod'
import { resourceIdPattern } from '../resource-id'

const resourceId = z.string().regex(resourceIdPattern)
export const categoryNameSchema = z
  .string({ error: '请填写分类名称。' })
  .transform((name) => name.trim().normalize('NFC'))
  .refine((name) => !!name && name.length <= 50 && !/[\u0000-\u001f\u007f]/.test(name), {
    error: '分类名称需要包含1～50个字符，不能包含换行或控制字符。',
  })
export const categoryInputSchema = z.object({ name: categoryNameSchema })
export const formulaCategoryInputSchema = z.object({ categoryId: resourceId.nullable() })
export const libraryFiltersSchema = z
  .object({
    q: z
      .string()
      .refine((value) => value.length <= 200 && !value.includes('\0'))
      .transform((value) => value.trim())
      .optional(),
    category: z.union([z.literal('uncategorized'), resourceId]).optional(),
    cursor: resourceId.optional(),
    favorites: z.enum(['true', 'false']).optional(),
  })
  .transform(({ q, category, cursor, favorites }) => ({
    q,
    category,
    cursor,
    favorites: favorites === 'true',
  }))
export type CategoryPayload = z.output<typeof categoryInputSchema>
export type FormulaCategoryPayload = z.output<typeof formulaCategoryInputSchema>
