import type { ChatRequest, ChatResponse } from '../../shared/types/api'

export function replyMock(request: ChatRequest): ChatResponse {
  const content = request.formula
    ? '这是一条固定的模拟回答，用于预览公式解析和连续追问的界面。\n\n真实服务接入后，会围绕上方已确认的公式版本解释符号含义、适用条件，并给出推导或计算示例。当前内容不作为数学解答。'
    : '这是一条固定的模拟回答。你可以从公式库打开一条公式，点击「AI 解析这个公式」，预览带公式上下文的对话。\n\n真实 AI 解释与连续追问将在后续接入。'
  return {
    requestId: crypto.randomUUID(),
    message: { role: 'assistant', content },
    formulaVersionId: request.formula?.versionId ?? null,
    isMock: true,
  }
}
