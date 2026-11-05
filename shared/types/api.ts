import type { z } from 'zod'
import type {
  demoImageMetadataSchema,
  demoRecognitionInputSchema,
  demoChatMessageSchema,
  demoFormulaContextSchema,
} from '../schemas/demo-input'

/** Shared business contracts. Python-specific response fields belong in a server adapter. */
export type RecognitionMode = 'handwritten' | 'printed'
export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed'

export type ImageMetadata = z.output<typeof demoImageMetadataSchema>

/** Day 1 sends metadata only. A real upload will supply an owned fileId. */
export type RecognitionRequest = z.output<typeof demoRecognitionInputSchema>

export interface RecognitionResult {
  requestId: string
  latex: string
  modelVersion: string
  isMock: boolean
  confidence?: number
}

export interface FormulaVersion {
  id: string
  latex: string
  createdAt: string
}

export interface Formula {
  id: string
  title: string
  originalLatex: string
  latex: string
  versionId: string
  versions: FormulaVersion[]
  categoryId: string | null
  favorite: boolean
  createdAt: string
  updatedAt: string
  source: 'demo' | 'mock-recognition'
  imageName?: string
}

export interface Category {
  id: string
  name: string
}

export type ChatMessage = z.output<typeof demoChatMessageSchema>

export type FormulaContext = z.output<typeof demoFormulaContextSchema>

export interface ChatRequest {
  responseKind?: 'TEXT' | 'FORMULA_EXPLANATION'
  promptVersion?: string | null
  baseExplanation?: { question: string; answer: string }
  formula?: FormulaContext
  messages: ChatMessage[]
}

export interface ChatResponse {
  requestId: string
  message: ChatMessage
  formulaVersionId: string | null
  isMock: boolean
}

export interface HealthResponse {
  status: 'ok'
  app: string
  recognition: 'mock'
  chat: 'mock'
  persistence: 'browser-demo'
}
