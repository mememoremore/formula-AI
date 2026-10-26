import type { Category, ChatMessage, Formula } from './api'

export interface DemoState {
  schemaVersion: 1
  formulas: Formula[]
  categories: Category[]
  chats: Record<string, ChatMessage[]>
}
