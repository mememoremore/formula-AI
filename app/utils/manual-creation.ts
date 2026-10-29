import type { ManualFormulaInput } from '../../shared/types/manual-formula'
import { manualFormulaFeedback } from '#shared/formula-validation'
export const MANUAL_CREATION_RECOVERY_KEY = 'formula-manual-creation-recovery-v1'
export interface ManualCreationReceipt {
  ownerId: string
  input: ManualFormulaInput
}
export function parseManualCreationReceipt(
  raw: string | null,
  ownerId: string,
): ManualCreationReceipt | null {
  if (!raw) return null
  if (raw.length > 40000) throw new Error('保存回执过大，请先到公式库核对。')
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object') throw new Error('保存回执无法读取，请先到公式库核对。')
  const row = value as Record<string, unknown>
  if (row.ownerId !== ownerId) return null
  if (!row.input || typeof row.input !== 'object')
    throw new Error('保存回执缺少内容，请先核对公式库。')
  const input = row.input as Record<string, unknown>
  if (
    typeof input.title !== 'string' ||
    typeof input.latex !== 'string' ||
    typeof input.requestKey !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestKey) ||
    manualFormulaFeedback(input.title, input.latex)
  )
    throw new Error('保存回执内容无效，请先到公式库核对。')
  return {
    ownerId,
    input: { requestKey: input.requestKey, title: input.title, latex: input.latex },
  }
}
