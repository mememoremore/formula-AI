import { computed, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import {
  categoryQueryOptions,
  currentQueryData,
  currentQueryError,
  isAccountQueryDenied,
} from '../queries/formula-queries'
import { useAccountFetch } from './useAccountFetch'
import { useAccountQueryOwner } from './useAccountQueryOwner'

export function useAccountCategories(expected?: MaybeRefOrGetter<string | undefined>) {
  const owner = useAccountQueryOwner(expected)
  const fetcher = useAccountFetch()
  const client = useNuxtApp().$queryClient
  const options = computed(() => categoryQueryOptions(owner.value, fetcher))
  const query = useQuery(options, client)
  const data = computed(() =>
    owner.value && !isAccountQueryDenied(query.error.value)
      ? currentQueryData(client, options.value.queryKey, query.data.value)
      : undefined,
  )
  const error = computed(() =>
    owner.value ? currentQueryError(client, options.value.queryKey, query.error.value) : null,
  )

  return {
    data,
    error,
    status: computed(() =>
      !owner.value ? 'idle' : error.value ? 'error' : data.value ? 'success' : 'pending',
    ),
    refresh: () => (owner.value ? query.refetch() : Promise.resolve()),
    ready: owner.value ? query.suspense().catch(() => undefined) : Promise.resolve(),
  }
}
