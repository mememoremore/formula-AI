export interface AccountUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
}

export interface AccountOverview {
  counts: { formulas: number; files: number; tasks: number; conversations: number }
  formulas: Array<{ id: string; title: string; updatedAt: string }>
}
