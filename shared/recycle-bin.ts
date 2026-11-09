export const RECYCLE_RETENTION_DAYS = 10
export const RECYCLE_RETENTION_MS = RECYCLE_RETENTION_DAYS * 86400000
export function recycleExpiry(deletedAt: Date) {
  return new Date(deletedAt.getTime() + RECYCLE_RETENTION_MS)
}
export interface RecycledFormula {
  id: string
  kind: 'formula'
  title: string
  latex: string
  deletedAt: string
  expiresAt: string
}
export interface RecycleBinView {
  items: RecycledFormula[]
  hasMore: boolean
  serverNow: string
}
