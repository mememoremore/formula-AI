import type { AccountUser } from '#shared/types/account'

export function useAccountSession() {
  return useFetch<{ user: AccountUser | null }>('/api/account/session', {
    key: 'account-session',
    credentials: 'include',
    timeout: 10_000,
    retry: 0,
  })
}
