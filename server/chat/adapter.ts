import type { ChatRequest } from '../../shared/types/api'

export interface ChatDelta {
  text: string
  finishReason?: string
}
export interface ChatAdapter {
  readonly isMock: boolean
  readonly model: string
  stream(input: ChatRequest, signal: AbortSignal): AsyncIterable<ChatDelta>
}
