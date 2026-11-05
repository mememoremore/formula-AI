import { demoChatInputSchema } from '../../shared/schemas/demo-input'
import { replyMock } from '../services/mock-chat'
import { invalidInput } from '../utils/validate-body'

export default defineEventHandler(async (event) => {
  const input = demoChatInputSchema.safeParse(await readBody(event))
  if (!input.success) invalidInput(input.error.issues[0]?.message ?? '消息格式无效或超过 2000 字。')
  return replyMock(input.data)
})
