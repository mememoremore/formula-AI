import type { ExportTaskState } from '../../shared/types/tasks'
export const EXPORT_RECOVERY_KEY = 'formula-ai:export-retry:v1'
export interface ExportReceipt {
  ownerId: string
  taskId: string
  versionId: string
  requestKey: string
}
/** 损坏的回执不能静默变成新请求，否则可能重复使用额度。 */
export function parseExportReceipts(raw: string | null): ExportReceipt[] {
  const rows: unknown = JSON.parse(raw ?? '[]')
  if (!Array.isArray(rows) || rows.length > 10) throw new Error('无法读取上次提交记录')
  const result: ExportReceipt[] = []
  for (const item of rows as unknown[]) {
    if (!item || typeof item !== 'object') throw new Error('无法读取上次提交记录')
    const row = item as Record<string, unknown>
    const text = (value: unknown): value is string =>
      typeof value === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value)
    if (!text(row.ownerId) || !text(row.taskId) || !text(row.versionId) || !text(row.requestKey))
      throw new Error('无法读取上次提交记录')
    const receipt = {
      ownerId: row.ownerId,
      taskId: row.taskId,
      versionId: row.versionId,
      requestKey: row.requestKey,
    }
    if (
      result.some((value) => value.ownerId === receipt.ownerId && value.taskId === receipt.taskId)
    )
      throw new Error('上次提交记录存在冲突')
    result.push(receipt)
  }
  return result
}
export function acceptExportSnapshot(previous: ExportTaskState | undefined, next: ExportTaskState) {
  if (!previous) return next
  if (
    previous.id !== next.id ||
    previous.formulaVersionId !== next.formulaVersionId ||
    previous.formulaId !== next.formulaId
  )
    throw new Error('导出任务响应不匹配')
  if (
    next.attemptCount < previous.attemptCount ||
    (['COMPLETED', 'FAILED'].includes(previous.status) && next.status !== previous.status)
  )
    return previous
  return next
}
export function exportDownloadPath(task: ExportTaskState) {
  const path = '/api/account/exports/' + encodeURIComponent(task.id) + '/download'
  return task.status === 'COMPLETED' && task.downloadUrl === path ? path : null
}
export function exportFilename(name: string) {
  return (
    name
      .replace(/[\\/\x00-\x1f\x7f]/g, '_')
      .slice(0, 180)
      .replace(/\.docx$/i, '') + '.docx'
  )
}
