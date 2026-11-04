import { test, expect, afterEach } from 'vitest'
import { dehydrate, hydrate } from '@tanstack/vue-query'
import {
  createAccountQueryClient,
  formulaQueryKeys,
  libraryQueryOptions,
  invalidateFormulaQueries,
} from '../app/queries/formula-queries'
const clients: ReturnType<typeof createAccountQueryClient>[] = []
afterEach(() => {
  for (const client of clients.splice(0)) client.clear()
})
function client() {
  const value = createAccountQueryClient(true)
  clients.push(value)
  return value
}

test('keys separate owner, kind and every submitted filter', () => {
  const base = formulaQueryKeys.library('a', 'library', {})
  for (const key of [
    formulaQueryKeys.library('b', 'library', {}),
    formulaQueryKeys.library('a', 'favorites', {}),
    formulaQueryKeys.library('a', 'library', { q: 'x' }),
    formulaQueryKeys.library('a', 'library', { category: 'c' }),
  ])
    expect(key).not.toEqual(base)
  expect(formulaQueryKeys.categories('a')).not.toEqual(base)
})

test('independent SSR clients never share user data and browser hydration reuses fresh results', async () => {
  const a = client(),
    b = client(),
    browser = client()
  const key = formulaQueryKeys.library('a', 'library', {})
  a.setQueryData(key, {
    pages: [{ items: [{ id: 'private-a' }], nextCursor: null }],
    pageParams: [null],
  })
  expect(b.getQueryData(key)).toBeUndefined()
  hydrate(browser, dehydrate(a))
  let calls = 0
  await browser.fetchInfiniteQuery(
    libraryQueryOptions('a', 'library', {}, async <T>() => {
      calls++
      return { items: [], nextCursor: null } as T
    }),
  )
  expect(calls).toBe(0)
  expect(browser.getQueryData(key)).toEqual(a.getQueryData(key))
  a.clear()
  expect(browser.getQueryData(key)).toBeDefined()
})

test('write invalidation is limited to the original owner and includes categories', async () => {
  const cache = client()
  const own = formulaQueryKeys.library('a', 'library', {}),
    category = formulaQueryKeys.categories('a'),
    other = formulaQueryKeys.categories('b')
  for (const key of [own, category, other]) cache.setQueryData(key, { marker: true })
  await invalidateFormulaQueries(cache, 'a')
  expect(cache.getQueryState(own)?.isInvalidated).toBe(true)
  expect(cache.getQueryState(category)?.isInvalidated).toBe(true)
  expect(cache.getQueryState(other)?.isInvalidated).toBe(false)
  await invalidateFormulaQueries(cache, undefined)
  expect(cache.getQueryState(other)?.isInvalidated).toBe(false)
})
