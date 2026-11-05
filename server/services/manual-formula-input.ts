import { createHash } from 'node:crypto'
import { manualFormulaInputSchema } from '../../shared/schemas/manual-formula-input'
import { parseInput } from './parse-input'
import type { ManualFormulaInput } from '../../shared/types/manual-formula'
export type { ManualFormulaInput } from '../../shared/types/manual-formula'
export function parseManualFormula(input: unknown): ManualFormulaInput {
  return parseInput(manualFormulaInputSchema, input, '请提供名称、LaTeX 和有效请求编号。')
}
export function manualFormulaHash(input: Pick<ManualFormulaInput, 'title' | 'latex'>) {
  return createHash('sha256')
    .update(JSON.stringify({ title: input.title, latex: input.latex }))
    .digest('hex')
}
