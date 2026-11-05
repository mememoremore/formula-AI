import {
  recognitionTaskInputSchema,
  conversationInputSchema,
  chatTurnInputSchema,
  explanationInputSchema,
  exportInputSchema,
  recognitionHistoryInputSchema,
  conversationListInputSchema,
} from '../../shared/schemas/task-input'
import { parseInput } from './parse-input'

export const parseRecognitionTaskInput = (input: unknown) =>
  parseInput(recognitionTaskInputSchema, input, '图片、识别模式、公式名称或请求编号无效。')
export const parseConversationInput = (input: unknown) =>
  parseInput(conversationInputSchema, input, '对话版本或请求编号无效。')
export const parseChatTurnInput = (input: unknown) =>
  parseInput(chatTurnInputSchema, input, '请填写有效的提问和请求编号。')
export const parseExplanationInput = (input: unknown) =>
  parseInput(explanationInputSchema, input, '公式版本或请求编号无效。')
export const parseExportInput = (input: unknown) =>
  parseInput(exportInputSchema, input, '请提供有效的公式版本和请求编号。')
export const parseRecognitionHistoryInput = (input: unknown) =>
  parseInput(recognitionHistoryInputSchema, input, '搜索或分页参数无效。')
export const parseConversationListInput = (input: unknown) =>
  parseInput(conversationListInputSchema, input, '搜索关键词不能超过100字。')
