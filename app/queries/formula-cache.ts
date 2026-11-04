import type { QueryClient } from '@tanstack/vue-query'
import { formulaQueryKeys, type LibraryPages } from './formula-queries'

export type LibraryRecordChange = { kind: 'remove' } | { kind: 'favorite'; value: boolean }

/** Apply only server-confirmed changes, across this owner's existing pages. Never invent filtered members. */
export function updateLibraryRecords(
  client: QueryClient,
  owner: string,
  id: string,
  change: LibraryRecordChange,
) {
  const prefix = [...formulaQueryKeys.owner(owner), 'library']
  void client.cancelQueries({ queryKey: prefix })
  for (const query of client.getQueryCache().findAll({ queryKey: prefix })) {
    const favoritesOnly = query.queryKey[3] === 'favorites'
    client.setQueryData<LibraryPages>(
      query.queryKey,
      (previous) =>
        previous && {
          ...previous,
          pages: previous.pages.map((page) => ({
            ...page,
            items: page.items.flatMap((item) =>
              item.id !== id
                ? [item]
                : change.kind === 'remove' || (favoritesOnly && !change.value)
                  ? []
                  : [{ ...item, favorite: change.value }],
            ),
          })),
        },
    )
  }
}
