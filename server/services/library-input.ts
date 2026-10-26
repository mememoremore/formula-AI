import type { FormulaLibraryFilters } from '../../shared/types/library'
import { hasValidResourceIdentity } from '../database/private-resources'
import { WorkspaceError } from './workspace-error'

export function parseLibraryFilters(query: Record<string, unknown>): FormulaLibraryFilters {
  const { q, category, favorites, cursor } = query
  if (
    (q !== undefined && (typeof q !== 'string' || q.length > 200 || q.includes('\0'))) ||
    (category !== undefined &&
      category !== 'uncategorized' &&
      !hasValidResourceIdentity(category, category)) ||
    (cursor !== undefined && !hasValidResourceIdentity(cursor, cursor)) ||
    (favorites !== undefined && favorites !== 'true' && favorites !== 'false')
  )
    throw new WorkspaceError(400, '搜索或分页参数无效，请重新选择。')
  return {
    q: typeof q === 'string' ? q.trim() : undefined,
    category: category as string | undefined,
    cursor: cursor as string | undefined,
    favorites: favorites === 'true',
  }
}

export function checkedCategoryName(input: unknown) {
  if (typeof input !== 'string') throw new WorkspaceError(400, '请填写分类名称。')
  const name = input.trim().normalize('NFC')
  if (!name || name.length > 50 || /[\u0000-\u001f\u007f]/.test(name))
    throw new WorkspaceError(400, '分类名称需要包含1～50个字符，不能包含换行或控制字符。')
  return name
}
