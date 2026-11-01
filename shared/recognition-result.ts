import type { JobStatus, RecognitionTaskState, RecognitionHistoryItem } from './types/tasks'
import { isRandomFormulaName } from './formula-title'
export type RecognitionResultState = 'pending' | 'available' | 'deleted' | 'missing'
export function recognitionResultState(
  status: JobStatus,
  formula: { id: string; deletedAt: Date | null } | null,
): RecognitionResultState {
  if (status !== 'COMPLETED') return 'pending'
  return formula ? (formula.deletedAt ? 'deleted' : 'available') : 'missing'
}
export function recognitionResultPresentation(
  task: Pick<RecognitionTaskState, 'status' | 'formulaId' | 'resultState'>,
) {
  const state =
    task.resultState ??
    (task.status !== 'COMPLETED' ? 'pending' : task.formulaId ? 'available' : 'missing')
  if (task.status !== 'COMPLETED' || state === 'available') return null
  return state === 'deleted'
    ? {
        heading: '公式已删除',
        description: '识别曾经完成，对应公式已从公式库删除。此处保留任务记录。',
        label: '公式已删除',
      }
    : {
        heading: '识别结果暂不可用',
        description: '这条历史任务缺少可查看的公式关联。可以重新读取，或返回上传页重新识别。',
        label: '结果暂不可用',
      }
}
export function recognitionHistoryTitle(
  item: Pick<RecognitionHistoryItem, 'title' | 'status' | 'formulaId' | 'resultState'>,
) {
  const base = item.title.replace(/\.[^.]+$/, '')
  if (!isRandomFormulaName(base)) return item.title
  return item.resultState === 'deleted' ? '已删除的识别结果' : '公式识别记录'
}
