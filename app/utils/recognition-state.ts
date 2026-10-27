import type { RecognitionTaskState } from '../../shared/types/tasks'
export interface RecognitionReceipt {
  ownerId: string
  fileId: string
  mode: 'handwritten' | 'printed'
  requestKey: string
  sourceTaskId?: string
}
export const RECOGNITION_RECOVERY_KEY = 'formula-ai:recognition-recovery:v1'
export function receiptIdentity(value: RecognitionReceipt) {
  return value.ownerId + ':' + (value.sourceTaskId ?? 'upload')
}
export function parseRecognitionReceipts(raw: string | null): RecognitionReceipt[] {
  try {
    const rows: unknown = JSON.parse(raw ?? '[]')
    if (!Array.isArray(rows) || rows.length > 20) return []
    const text = (value: unknown): value is string =>
      typeof value === 'string' && value.length > 0 && value.length <= 100
    const result: RecognitionReceipt[] = []
    for (const item of rows as unknown[]) {
      if (!item || typeof item !== 'object') return []
      const row = item as Record<string, unknown>
      if (
        !text(row.ownerId) ||
        !text(row.fileId) ||
        !text(row.requestKey) ||
        (row.mode !== 'handwritten' && row.mode !== 'printed') ||
        (row.sourceTaskId !== undefined && !text(row.sourceTaskId))
      )
        return []
      const value: RecognitionReceipt = {
        ownerId: row.ownerId,
        fileId: row.fileId,
        requestKey: row.requestKey,
        mode: row.mode,
        ...(row.sourceTaskId ? { sourceTaskId: row.sourceTaskId } : {}),
      }
      if (result.some((item) => receiptIdentity(item) === receiptIdentity(value))) return []
      result.push(value)
    }
    return result
  } catch {
    return []
  }
}
/** 不把合法的自动重试（PROCESSING -> QUEUED）误判成旧响应。 */
export function acceptRecognitionSnapshot(
  previous: RecognitionTaskState | undefined,
  next: RecognitionTaskState,
) {
  if (!previous) return next
  if (previous.id !== next.id || previous.fileId !== next.fileId || previous.mode !== next.mode)
    throw new Error('任务响应不匹配')
  if (
    next.attemptCount < previous.attemptCount ||
    ['COMPLETED', 'FAILED'].includes(previous.status)
  )
    return previous
  return next
}
/** 只集中识别流程已有的失效规则，不改全站缓存架构。 */
export function recognitionInvalidates(key: string, event: 'submitted' | 'changed' | 'completed') {
  return (
    key.startsWith('account-history') ||
    (event === 'submitted' && (key.startsWith('account-usage') || key === 'account-overview')) ||
    (event === 'completed' &&
      (key.startsWith('account-library-') ||
        ['home-recent', 'account-categories', 'account-overview'].includes(key)))
  )
}
/** 计算上传前的候选入口；调用方继续使用共享导航校验，不改变全局规则。 */
export function recognitionResultOrigin(origins: Record<string, string>, taskPath: string) {
  const source = origins[taskPath]
  return source?.split(/[?#]/)[0] === '/upload'
    ? (origins[source] ?? '/library?space=account&view=recent')
    : undefined
}
