import { z } from 'zod'
import { resourceIdPattern } from '../resource-id'
export const learningQuestion = z.object({
  id: z.string().regex(resourceIdPattern),
  question: z.string().trim().min(1).max(600),
  answer: z.string().trim().max(2000),
  source: z.enum(['ai', 'manual']).default('manual'),
})
export type LearningQuestion = z.output<typeof learningQuestion>
export const learningQuestions = z
  .array(learningQuestion)
  .max(20)
  .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length, '问题编号不能重复')
export const generatedQuestions = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(600),
        answer: z.string().trim().min(1).max(1600),
      }),
    )
    .length(3)
    .refine((rows) => new Set(rows.map((row) => row.question)).size === 3, '问题不能重复'),
})
export interface LearningGenerationView {
  status: 'PROCESSING' | 'READY' | 'FAILED'
  questions: LearningQuestion[]
  error: string | null
}
export const learningInput = z.object({
  revision: z.number().int().nonnegative(),
  notes: z.string().max(6000),
  conditions: z.string().max(2000),
  question: z.string().max(600).optional(),
  tags: z
    .array(z.string().trim().min(1).max(30))
    .max(12)
    .transform((tags) => [...new Set(tags)])
    .optional(),
  questions: learningQuestions.optional(),
  mastery: z.enum(['UNFAMILIAR', 'MASTERED']).optional(),
  masteryNotes: z.string().max(2000).optional(),
  conditionsCustomized: z.boolean().optional(),
  reviewEnabled: z.boolean(),
})
export const reviewInput = z.object({
  revision: z.number().int().nonnegative(),
  rating: z.enum(['again', 'hard', 'known']),
})
export const restoreInput = z.object({
  kind: z.literal('formula'),
  ids: z
    .array(z.string().regex(resourceIdPattern))
    .min(1)
    .max(100)
    .transform((ids) => [...new Set(ids)]),
})
export interface FormulaLearningView {
  revision: number
  notes: string
  conditions: string
  question: string
  tags: string[]
  questions: LearningQuestion[]
  questionsInitialized: boolean
  conditionsCustomized: boolean
  mastery: 'UNFAMILIAR' | 'MASTERED'
  masteryNotes: string
  reviewEnabled: boolean
  nextReviewAt: string | null
  intervalDays: number
}
export function reviewSchedule(
  rating: 'again' | 'hard' | 'known',
  previousDays: number,
  now: Date,
) {
  const days =
    rating === 'again'
      ? 0
      : rating === 'hard'
        ? 1
        : Math.min(90, previousDays ? previousDays * 2 : 3)
  return {
    intervalDays: days,
    nextReviewAt: new Date(now.getTime() + (days ? days * 86400000 : 600000)),
  }
}
