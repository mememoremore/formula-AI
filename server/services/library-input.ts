import {
  categoryNameSchema,
  categoryInputSchema,
  formulaCategoryInputSchema,
  libraryFiltersSchema,
} from '../../shared/schemas/library-input'
import { parseInput } from './parse-input'

export function parseLibraryFilters(query: Record<string, unknown>) {
  return parseInput(libraryFiltersSchema, query, '搜索或分页参数无效，请重新选择。')
}
export function checkedCategoryName(input: unknown) {
  return parseInput(categoryNameSchema, input, '请填写分类名称。')
}
export function parseCategoryInput(input: unknown) {
  return parseInput(categoryInputSchema, input, '请填写分类名称。')
}
export function parseFormulaCategory(input: unknown) {
  return parseInput(formulaCategoryInputSchema, input, '请选择有效的分类或未分类。')
}
