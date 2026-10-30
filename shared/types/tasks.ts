export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
export type JobKind = 'recognition' | 'chat' | 'export'
export interface TaskState {
  id: string
  status: JobStatus
  attemptCount: number
  maxAttempts: number
  errorMessage: string | null
}
export interface RecognitionTaskState extends TaskState {
  fileId: string
  mode: 'handwritten' | 'printed'
  requestedTitle: string | null
  formulaId: string | null
  isMock: boolean
}
export interface RecognitionHistoryItem {
  id: string
  status: JobStatus
  title: string
  formulaId: string | null
  latex: string | null
  createdAt: string
  errorMessage: string | null
}
export interface RecognitionHistoryPage {
  items: RecognitionHistoryItem[]
  nextCursor: string | null
}
export interface ExportTaskState extends TaskState {
  title: string
  formulaId: string
  formulaVersionId: string
  versionNumber: number
  downloadUrl: string | null
  file?: { name: string; sizeBytes: number } | null
}
export interface VersionContext {
  id: string
  formulaId: string
  title: string
  number: number
  latex: string
}
export interface AccountMessage {
  structuredContent?: import('../explanation').FormulaExplanation | null
  id: string
  role: 'USER' | 'ASSISTANT'
  content: string
  status: 'STREAMING' | 'COMPLETED' | 'FAILED'
  isMock: boolean
  modelVersion: string | null
  position: number
}
export interface ChatTurnState extends TaskState {
  responseKind?: 'TEXT' | 'FORMULA_EXPLANATION'
  partialContent: string
  isMock: boolean
  modelVersion: string | null
}
export interface BaseExplanation {
  isMock: boolean
  modelVersion: string | null
  messageId: string
  turnId: string
  createdAt: string
  content: string
  structured: import('../explanation').FormulaExplanation
  promptVersion: string
}
export interface ExplanationHistoryPage {
  items: {
    id: string
    versionId: string
    versionNumber: number
    isMock: boolean
    modelVersion: string | null
    createdAt: string
    status: JobStatus
    errorMessage: string | null
    promptVersion: string | null
  }[]
  nextCursor: string | null
}
export interface SavedConversation {
  purpose?: 'CHAT' | 'EXPLANATION'
  baseExplanation?: BaseExplanation | null
  /** 老客户端/旧fixtures可缺省；v2读入口运行时要求两者齐全。 */
  protocolVersion?: 2
  revision?: string
  id: string
  title: string
  context: VersionContext | null
  messages: AccountMessage[]
  currentTurn: ChatTurnState | null
  hasEarlierMessages: boolean
}
export interface ConversationPage {
  items: { id: string; title: string; createdAt: string; preview?: string; latex?: string | null }[]
  nextCursor: string | null
}
export interface UsageOverview {
  day: string
  resetsAt: string
  items: {
    kind: 'RECOGNITION' | 'CHAT' | 'EXPORT'
    used: number
    limit: number
    remaining: number
  }[]
}
