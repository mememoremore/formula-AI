import { VueQueryPlugin, dehydrate, hydrate, type DehydratedState } from '@tanstack/vue-query'
import { createAccountQueryClient } from '~/queries/formula-queries'

export default defineNuxtPlugin({
  name: 'account-query',
  setup(app) {
    // Created here, never at module scope: each SSR request owns an isolated cache.
    const queryClient = createAccountQueryClient(import.meta.server)
    const state = useState<DehydratedState | null>('account-query-cache', () => null)
    app.vueApp.use(VueQueryPlugin, { queryClient })
    if (import.meta.server)
      app.hook('app:rendered', () => {
        state.value = dehydrate(queryClient)
        queryClient.clear()
      })
    if (import.meta.client) {
      if (state.value) hydrate(queryClient, state.value)
      state.value = null
    }
    return { provide: { queryClient } }
  },
})
