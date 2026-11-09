import { z } from 'zod'
import { resourceIdPattern } from '../resource-id'
import { explanationDomainSchema } from '../explanation-domain'
const id = z
  .string()
  .regex(resourceIdPattern)
  .transform((v) => v.toLowerCase())
export const repairInputSchema = z.object({
  requestKey: id,
  expectedVersionId: id,
  domain: explanationDomainSchema,
})
export const repairOutputSchema = z.object({
  status: z.enum(['candidate', 'unchanged', 'uncertain']),
  latex: z.string().trim().min(1).max(4000).optional(),
  reason: z.string().trim().min(1).max(600),
})
export const duplicateDecisionSchema = z.object({
  versionId: id,
  matchId: id,
  matchVersionId: id,
  decision: z.enum(['agree', 'ignore']),
})
export interface DuplicateView {
  status: 'none' | 'pending' | 'agree' | 'ignore' | 'unavailable' | 'checking'
  versionId: string
  match?: { id: string; versionId: string; latex: string; title: string }
  reason?: string
}
export interface RepairView {
  id: string
  status: string
  originalLatex: string
  candidateLatex: string | null
  domain: string
  reason: string | null
  expiresAt: string
}
export const aiVerdictSchema = z.object({
  decision: z.enum(['same', 'different', 'uncertain']),
  candidateId: z.string(),
  confidence: z.number().min(0).max(1),
  relation: z.string(),
  assumptions: z.array(z.unknown()),
  domainConflict: z.boolean(),
  reason: z.string().trim().min(1).max(500),
})
