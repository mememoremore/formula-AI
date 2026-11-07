import { workspaceFeedback } from '~/utils/workspace-feedback'
import { useFormulaFavoriteMutation } from './useFormulaMutations'
import { isAccountWriteCancelled } from './useAccountMutation'

export function useAccountFavorite() {
  const mutation = useFormulaFavoriteMutation()
  const { showToast } = useToast()

  async function setFavorite(id: string, favorite: boolean) {
    if (mutation.busy.value) return null
    try {
      const result = await mutation.execute({ id, favorite })

      showToast(result.favorite ? '已收藏。' : '已取消收藏。')
      return result.favorite
    } catch (error) {
      if (!isAccountWriteCancelled(error)) showToast(workspaceFeedback(error))
      return null
    }
  }

  return { busy: mutation.busy, setFavorite }
}
