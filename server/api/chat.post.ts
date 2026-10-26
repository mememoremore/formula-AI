import type { ChatRequest } from '../../shared/types/api'
import { replyMock } from '../services/mock-chat'
import { invalidInput, isRecord, isText } from '../utils/validate-body'

export default defineEventHandler(async (event) => {
  const body: unknown = await readBody(event)
  if (
    !isRecord(body) ||
    !Array.isArray(body.messages) ||
    body.messages.length < 1 ||
    body.messages.length > 20
  ) {
    invalidInput('对话需要包含 1～20 条消息。')
  }
  for (const item of body.messages) {
    if (
      !isRecord(item) ||
      (item.role !== 'user' && item.role !== 'assistant') ||
      !isText(item.content, 2000)
    ) {
      invalidInput('消息格式无效或超过 2000 字。')
    }
  }
  if (body.messages.at(-1)?.role !== 'user') invalidInput('最后一条消息必须是你的提问。')
  if (
    body.formula !== undefined &&
    (!isRecord(body.formula) ||
      !isText(body.formula.versionId, 100) ||
      !isText(body.formula.latex, 5000))
  ) {
    invalidInput('公式版本信息无效。')
  }
  // All fields are validated before the business adapter receives the request.
  return replyMock(body as unknown as ChatRequest)
})
