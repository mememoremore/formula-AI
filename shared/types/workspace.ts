import type { FormulaCategory } from './library'

export interface UploadedImage {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  width: number
  height: number
}
export interface SavedFormulaVersion {
  id: string
  number: number
  latex: string
  origin: 'RECOGNITION' | 'MANUAL' | 'DEMO'
  isMock: boolean
  createdAt: string
}
export interface SavedFormula {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  image: UploadedImage | null
  versions: SavedFormulaVersion[]
  category: FormulaCategory | null
  favorite: boolean
}
export interface FormulaHistoryItem {
  id: string
  title: string
  createdAt: string
  latex: string
  versionNumber: number
  isMock: boolean
}
export interface FormulaHistoryPage {
  items: FormulaHistoryItem[]
  nextCursor: string | null
}
export interface SavedRecognition {
  formulaId: string
  taskId: string
  isMock: boolean
}
