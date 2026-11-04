import { formulaViewsInvalidated } from '../utils/account-cache'
import { invalidateFormulaQueries } from '../queries/formula-queries'

/** One notification bridges migrated reads and legacy history/home reads; no duplicate list cache. */
export function useFormulaViewsInvalidation() {
  const client = useNuxtApp().$queryClient
  return (owner: string | undefined) => {
    clearNuxtData(formulaViewsInvalidated)
    return invalidateFormulaQueries(client, owner)
  }
}
