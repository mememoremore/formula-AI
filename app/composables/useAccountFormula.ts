import type { SavedFormula } from '#shared/types/workspace'
import { formulaViewsInvalidated } from '~/utils/account-cache'

/** 请求结果同时绑定身份和资源；身份未确认时不展示旧快照。 */
export function useAccountFormula(id: Ref<string>, ownerId: Ref<string | undefined>) {
  const fetcher = useRequestFetch()
  const key = computed(() => `saved-formula-${id.value}-${ownerId.value ?? 'unconfirmed'}`)
  const request = useAsyncData(
    key,
    async (_app, { signal }) => {
      const owner = ownerId.value
      const resource = id.value
      if (!owner) return { owner: undefined, resource, formula: undefined }
      const formula = await fetcher<SavedFormula>(
        '/api/account/formulas/' + encodeURIComponent(resource),
        {
          signal,
          retry: 0,
          timeout: 15_000,
        },
      )
      signal.throwIfAborted()
      return { owner, resource, formula }
    },
    { getCachedData: (key, app) => (app.isHydrating ? app.payload.data[key] : undefined) },
  )
  const formula = computed(() => {
    const value = request.data.value
    return ownerId.value && value?.owner === ownerId.value && value.resource === id.value
      ? value.formula
      : undefined
  })
  function update(value: SavedFormula) {
    if (value.id !== id.value || request.data.value?.owner !== ownerId.value || !ownerId.value)
      return
    request.data.value = { owner: ownerId.value, resource: id.value, formula: value }
    clearNuxtData(formulaViewsInvalidated)
  }
  return { request, formula, update }
}
