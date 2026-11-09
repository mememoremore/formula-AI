import { z } from 'zod'
import { resourceIdPattern } from './resource-id'
import { manualFormulaFeedback } from './formula-validation'
export const recommendationWeights = { unfamiliar: 60, due: 40 } as const
export interface RecommendationCandidate {
  id: string
  title: string
  latex: string
  versionId: string
  category: string | null
  mastery: string
  due: boolean
  conditions: string
  notes: string
  masteryNotes: string
}
export const recommendationKinds = {
  DERIVATION: '连续推导',
  STRUCTURAL: '结构相似',
  SEMANTIC: '含义相近',
  SIMPLIFICATION: '公式化简',
} as const
const generatedOutput = z
  .object({
    kind: z.enum(['DERIVATION', 'STRUCTURAL', 'SEMANTIC', 'SIMPLIFICATION']),
    sourceIds: z.array(z.string().regex(resourceIdPattern)).min(1).max(4),
    title: z.string().trim().min(1).max(100),
    latex: z.string().trim().min(1).max(2000),
    reason: z.string().trim().min(1).max(240),
    conditions: z.string().trim().min(1).max(600),
    steps: z
      .array(
        z
          .object({
            latex: z.string().trim().min(1).max(2000),
            explanation: z.string().trim().min(1).max(240),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict()
export const recommendationOutput = z.object({
  recommendations: z
    .array(
      z.union([
        z
          .object({
            id: z.string().regex(resourceIdPattern),
            reason: z.string().trim().min(1).max(240),
          })
          .strict(),
        generatedOutput,
      ]),
    )
    .min(1)
    .max(5),
})
export interface LibraryRecommendation {
  id: string
  title: string
  latex: string
  reason: string
  kind?: undefined
}
export interface GeneratedRecommendation extends z.infer<typeof generatedOutput> {
  id: string
  sources: { id: string; title: string; latex: string }[]
}
export interface RecommendationView {
  fingerprint: string
  status: 'EMPTY' | 'PREVIEW' | 'PROCESSING' | 'READY' | 'FAILED'
  source: 'RULES' | 'AI'
  canGenerate: boolean
  warning: string | null
  profile: { grade: string; learningPurpose: string }
  items: (LibraryRecommendation | GeneratedRecommendation)[]
}
function formulaKey(latex: string) {
  return /\\(?:text|operatorname)\b/.test(latex) ? latex.trim() : latex.replace(/\s+/g, '')
}
export function ruleCandidates<T extends RecommendationCandidate>(rows: T[]) {
  const score = (row: T) =>
    (row.mastery === 'MASTERED' ? 0 : recommendationWeights.unfamiliar) +
    (row.due ? recommendationWeights.due : 0)
  const seen = new Set<string>()
  return [...rows]
    .sort((a, b) => score(b) - score(a))
    .filter((row) => {
      const key = /\\(?:text|operatorname)\b/.test(row.latex)
        ? row.latex.trim()
        : row.latex.replace(/\s+/g, '')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 20)
}
export function checkedRecommendations(
  raw: unknown,
  candidates: RecommendationCandidate[],
  existingLatex = candidates.map((row) => row.latex),
) {
  const output = recommendationOutput.parse(raw).recommendations
  const known = new Set(candidates.map((row) => row.id))
  const seen = new Set<string>()
  const keys = new Set(existingLatex.map(formulaKey))
  if (!output.some((item) => 'kind' in item) && output.length < Math.min(3, candidates.length))
    throw new Error('推荐数量不足。')
  for (const item of output) {
    if ('kind' in item) {
      const key = formulaKey(item.latex)
      if (
        keys.has(key) ||
        seen.has(key) ||
        new Set(item.sourceIds).size !== item.sourceIds.length ||
        item.sourceIds.some((id) => !known.has(id)) ||
        manualFormulaFeedback(item.title, item.latex) ||
        item.steps.some((step) => manualFormulaFeedback('步骤', step.latex)) ||
        (item.kind === 'DERIVATION' && item.steps.length < 2)
      )
        throw new Error('新公式须包含有效来源、完整步骤且不重复。')
      seen.add(key)
    } else {
      if (!known.has(item.id) || seen.has(item.id))
        throw new Error('推荐必须来自当前公式库且不重复。')
      seen.add(item.id)
    }
  }
  return output
}
export function ruleRecommendationReason(row: RecommendationCandidate) {
  return row.due
    ? '已到复习时间，建议优先回忆适用条件并完成练习。'
    : row.mastery === 'MASTERED'
      ? '已掌握，可用于巩固和联系其他公式。'
      : '尚未掌握，建议先理解符号含义和适用条件。'
}
