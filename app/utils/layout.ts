export type ContentWidth = 'compact' | 'reading' | 'workspace'

/** 未声明或无效的元信息始终保持现有窄屏布局。 */
export function contentWidth(value: unknown): ContentWidth {
  return value === 'reading' || value === 'workspace' ? value : 'compact'
}
