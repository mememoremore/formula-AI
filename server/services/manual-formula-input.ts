import { createHash } from 'node:crypto'
import { manualFormulaFeedback } from '../../shared/formula-validation'
import { hasValidResourceIdentity } from '../database/private-resources'
import { WorkspaceError } from './workspace-error'
import type { ManualFormulaInput } from '../../shared/types/manual-formula'
export type { ManualFormulaInput } from '../../shared/types/manual-formula'
export function parseManualFormula(input: unknown): ManualFormulaInput {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new WorkspaceError(400, '请求内容无效。')
  const row = input as Record<string, unknown>
  if (
    typeof row.title !== 'string' ||
    typeof row.latex !== 'string' ||
    typeof row.requestKey !== 'string' ||
    !hasValidResourceIdentity(row.requestKey, row.requestKey)
  )
    throw new WorkspaceError(400, '请提供名称、LaTeX 和有效请求编号。')
  const feedback = manualFormulaFeedback(row.title, row.latex)
  if (feedback) throw new WorkspaceError(400, feedback)
  return {
    requestKey: row.requestKey.toLowerCase(),
    title: row.title.trim(),
    latex: row.latex.trim(),
  }
}
export function manualFormulaHash(input: Pick<ManualFormulaInput, 'title' | 'latex'>) {
  return createHash('sha256')
    .update(JSON.stringify({ title: input.title, latex: input.latex }))
    .digest('hex')
}
