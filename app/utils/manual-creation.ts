import type { ManualFormulaInput } from '../../shared/types/manual-formula'
import { manualFormulaRawInputSchema } from '#shared/schemas/manual-formula-input'
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
  const input = manualFormulaRawInputSchema.safeParse(row.input)
  if (!input.success) throw new Error('保存回执内容无效，请先到公式库核对。')
  return { ownerId, input: input.data }
}
