import { z } from 'zod'
import { resourceIdPattern } from '../resource-id'

export const recognitionHistoryDeleteSchema = z.object({
  ids: z
    .array(
      z
        .string()
        .regex(resourceIdPattern)
        .transform((id) => id.toLowerCase()),
    )
    .min(1)
    .max(100)
    .transform((ids) => [...new Set(ids)].sort()),
})
