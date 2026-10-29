export const EXPLANATION_RECOVERY_KEY = 'formula-explanation-request-v1'
export interface ExplanationIntent {
  ownerId: string
  formulaId: string
  versionId: string
  requestKey: string
}
export function parseExplanationIntent(
  raw: string | null,
  ownerId: string,
  formulaId: string,
): ExplanationIntent | null {
  if (!raw || raw.length > 1500) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const row = value as Record<string, unknown>
    if (
      row.ownerId !== ownerId ||
      row.formulaId !== formulaId ||
      !['ownerId', 'formulaId', 'versionId', 'requestKey'].every(
        (key) =>
          typeof row[key] === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(row[key] as string),
      )
    )
      return null
    return row as unknown as ExplanationIntent
  } catch {
    return null
  }
}
