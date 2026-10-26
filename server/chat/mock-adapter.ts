import { setTimeout as delay } from 'node:timers/promises'
import { replyMock } from '../services/mock-chat'
import type { ChatAdapter } from './adapter'

export const mockChatAdapter: ChatAdapter = {
  isMock: true,
  model: 'mock-chat-v1',
  async *stream(input, signal) {
    const text = replyMock(input).message.content
    for (let index = 0; index < text.length; index += 12) {
      await delay(40, undefined, { signal })
      yield { text: text.slice(index, index + 12) }
    }
    yield { text: '', finishReason: 'stop' }
  },
}
