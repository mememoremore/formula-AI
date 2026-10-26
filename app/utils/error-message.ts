export function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as { message?: string } | undefined
    if (data?.message) return data.message
  }
  return fallback
}
