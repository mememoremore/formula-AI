import { workspaceFeedback } from '~/utils/workspace-feedback'
import type { SavedFormula } from '#shared/types/workspace'

export function useAccountFavorite() {
  const busy = ref(false)
  const { showToast } = useToast()
  const controller = new AbortController()
  let disposed = false
  onScopeDispose(() => {
    disposed = true
    controller.abort()
  })
  async function setFavorite(id: string, favorite: boolean) {
    if (busy.value) return null
    busy.value = true
    const cachedFormula = useNuxtData<SavedFormula>(`saved-formula-${id}`)
    try {
      const result = await $fetch<{ favorite: boolean }>(`/api/account/formulas/${id}/favorite`, {
        method: 'PUT',
        body: { favorite },
        retry: 0,
        timeout: 15_000,
        signal: controller.signal,
      })
      if (disposed) return null
      if (cachedFormula.data.value)
        cachedFormula.data.value = { ...cachedFormula.data.value, favorite: result.favorite }
      showToast(result.favorite ? '已收藏。' : '已取消收藏。')
      return result.favorite
    } catch (error) {
      if (disposed) return null
      showToast(workspaceFeedback(error))
      return null
    } finally {
      busy.value = false
    }
  }
  return { busy, setFavorite }
}
