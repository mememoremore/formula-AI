import type { FormulaEditPayload, FormulaFavoritePayload } from '#shared/schemas/formula-input'
import type { FormulaCategoryPayload, CategoryPayload } from '#shared/schemas/library-input'
import type { SavedFormula } from '#shared/types/workspace'
import { useAccountFetch } from './useAccountFetch'
import { useAccountMutation } from './useAccountMutation'
import { useFormulaViewsInvalidation } from './useFormulaViewsInvalidation'
import { updateLibraryRecords } from '../queries/formula-cache'

export type FormulaEditInput = { id: string } & FormulaEditPayload
export function useFormulaEditMutation() {
  const fetcher = useAccountFetch(),
    invalidate = useFormulaViewsInvalidation()
  return useAccountMutation(
    'edit',
    async (input: FormulaEditInput, { owner, signal }) => {
      const { id, ...body } = input
      return fetcher<SavedFormula>('/api/account/formulas/' + encodeURIComponent(id), {
        method: 'PATCH',
        body,
        headers: { 'x-account-id': owner },
        signal,
        retry: 0,
        timeout: 20_000,
      })
    },
    (_result, _input, owner) => {
      void invalidate(owner)
    },
  )
}
export function useFormulaDeleteMutation() {
  const fetcher = useAccountFetch(),
    invalidate = useFormulaViewsInvalidation(),
    client = useNuxtApp().$queryClient
  return useAccountMutation(
    'delete',
    (id: string, { owner, signal }) =>
      fetcher('/api/account/formulas/' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { 'x-account-id': owner },
        signal,
        retry: 0,
        timeout: 15_000,
      }),
    (_result, id, owner) => {
      updateLibraryRecords(client, owner, id, { kind: 'remove' })
      void invalidate(owner)
    },
  )
}
export function useFormulaFavoriteMutation() {
  const fetcher = useAccountFetch(),
    invalidate = useFormulaViewsInvalidation(),
    client = useNuxtApp().$queryClient
  return useAccountMutation(
    'favorite',
    (input: { id: string } & FormulaFavoritePayload, { owner, signal }) =>
      fetcher<{ favorite: boolean }>(
        '/api/account/formulas/' + encodeURIComponent(input.id) + '/favorite',
        {
          method: 'PUT',
          body: { favorite: input.favorite },
          headers: { 'x-account-id': owner },
          signal,
          retry: 0,
          timeout: 15_000,
        },
      ),
    (result, input, owner) => {
      updateLibraryRecords(client, owner, input.id, { kind: 'favorite', value: result.favorite })
      void invalidate(owner)
    },
  )
}
export function useFormulaCategoryMutation() {
  const fetcher = useAccountFetch(),
    invalidate = useFormulaViewsInvalidation()
  return useAccountMutation(
    'assign-category',
    (input: { id: string } & FormulaCategoryPayload, { owner, signal }) =>
      fetcher<SavedFormula>('/api/account/formulas/' + encodeURIComponent(input.id) + '/category', {
        method: 'PUT',
        body: { categoryId: input.categoryId },
        headers: { 'x-account-id': owner },
        signal,
        retry: 0,
        timeout: 15_000,
      }),
    (_result, _input, owner) => {
      void invalidate(owner)
    },
  )
}
export type CategoryWrite =
  | ({ action: 'create' } & CategoryPayload)
  | ({ action: 'rename'; id: string } & CategoryPayload)
  | { action: 'delete'; id: string }
export function useCategoryMutation() {
  const fetcher = useAccountFetch(),
    invalidate = useFormulaViewsInvalidation()
  return useAccountMutation(
    'category',
    (input: CategoryWrite, { owner, signal }) =>
      fetcher(
        '/api/account/categories' +
          (input.action === 'create' ? '' : '/' + encodeURIComponent(input.id)),
        {
          method:
            input.action === 'create' ? 'POST' : input.action === 'rename' ? 'PATCH' : 'DELETE',
          ...(input.action !== 'delete' ? { body: { name: input.name } } : {}),
          headers: { 'x-account-id': owner },
          signal,
          retry: 0,
          timeout: 15_000,
        },
      ),
    (_result, _input, owner) => {
      void invalidate(owner)
    },
  )
}
