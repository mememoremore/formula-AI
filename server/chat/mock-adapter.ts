import { setTimeout as delay } from 'node:timers/promises'
import { replyMock } from '../services/mock-chat'
import type { ChatAdapter } from './adapter'

export const mockChatAdapter: ChatAdapter = {
  isMock: true,
  model: 'mock-chat-v1',
  async *stream(input, signal) {
    const text =
      input.responseKind === 'FORMULA_EXPLANATION'
        ? JSON.stringify({
            schemaVersion: 1,
            summary: '这是固定版本公式的模拟解释，不代表真实模型结论。',
            symbols: [],
            conditions: ['请核对公式适用条件。'],
            steps: [
              {
                title: '阅读公式',
                text: '先识别符号及运算关系。',
                latex: input.formula?.latex ?? 'x=1',
              },
            ],
            examples: [],
            warnings: ['当前使用模拟回答。'],
          })
        : replyMock(input).message.content
    for (let index = 0; index < text.length; index += 12) {
      await delay(40, undefined, { signal })
      yield { text: text.slice(index, index + 12) }
    }
    yield { text: '', finishReason: 'stop' }
  },
}
