import {
  formulaEditInputSchema,
  formulaFavoriteInputSchema,
} from '../../shared/schemas/formula-input'
import { parseInput } from './parse-input'

export function parseFormulaEdit(input: unknown) {
  return parseInput(formulaEditInputSchema, input, '请填写有效的名称、LaTeX 和编辑版本。')
}
export function parseFormulaFavorite(input: unknown) {
  return parseInput(formulaFavoriteInputSchema, input, '收藏状态必须为布尔值。')
}
