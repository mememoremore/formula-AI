/** SSR retains Nuxt's cookie forwarding; browser uses the instrumented account client. */
export function useAccountFetch() {
  if (import.meta.server) return useRequestFetch()
  return useNuxtApp().$accountFetch ?? $fetch
}
