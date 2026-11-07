import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { AccountUser } from '#shared/types/account'

/** Cache identity is not authorization. Only expose data for the confirmed session owner. */
export function useAccountQueryOwner(expected?: MaybeRefOrGetter<string | undefined>) {
  const session = useNuxtData<{ user: AccountUser | null }>('account-session')

  return computed(() => {
    const actual = session.data.value?.user?.id
    const owner = expected === undefined ? actual : toValue(expected)

    return actual && actual === owner ? actual : undefined
  })
}
