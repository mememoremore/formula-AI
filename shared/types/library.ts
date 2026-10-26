import type { FormulaHistoryItem } from './workspace'

export interface FormulaCategory {
  id: string
  name: string
}
export interface AccountCategory extends FormulaCategory {
  formulaCount: number
}
export interface CategoryCollection {
  items: AccountCategory[]
  totalCount: number
  uncategorizedCount: number
}
export interface FormulaLibraryItem extends FormulaHistoryItem {
  imageId?: string | null
  category: FormulaCategory | null
  favorite: boolean
}
export interface FormulaLibraryPage {
  items: FormulaLibraryItem[]
  nextCursor: string | null
}
export interface FormulaLibraryFilters {
  q?: string
  category?: string
  favorites?: boolean
  cursor?: string
}
