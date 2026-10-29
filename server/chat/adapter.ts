import type { ChatRequest } from '../../shared/types/api'

export interface ChatDelta {
  text: string
  finishReason?: string
  usage?: ChatUsage
}
export interface ChatUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}
export interface ChatCallObserver {
  beforeDispatch(): Promise<void>
  invoked(): Promise<void>
  responded(status: number, requestId: string | null): Promise<void>
}
export interface ChatAdapter {
  readonly isMock: boolean
  readonly model: string
  stream(
    input: ChatRequest,
    signal: AbortSignal,
    observer?: ChatCallObserver,
  ): AsyncIterable<ChatDelta>
}
