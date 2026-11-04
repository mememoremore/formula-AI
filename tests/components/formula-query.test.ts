import { test, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { VueQueryPlugin } from '@tanstack/vue-query'
import {
  createAccountQueryClient,
  formulaQueryKeys,
  type AccountQueryFetch,
} from '../../app/queries/formula-queries'
import { useAccountLibrary } from '../../app/composables/useAccountLibrary'
import { useAccountCategories } from '../../app/composables/useAccountCategories'
import { useFormulaViewsInvalidation } from '../../app/composables/useFormulaViewsInvalidation'
import type {
  FormulaLibraryItem,
  FormulaLibraryPage,
  CategoryCollection,
} from '../../shared/types/library'

type Options = Parameters<AccountQueryFetch>[1]
const session = ref<{ user: { id: string } | null }>({ user: { id: 'a' } })
const owner = ref<string | undefined>('a')
const route = reactive<{ query: Record<string, string | string[]> }>({ query: {} })
let client: ReturnType<typeof createAccountQueryClient>
const transport = vi.fn<(url: string, options: Options) => Promise<unknown>>()
const read: AccountQueryFetch = <T>(url: string, options: Options) =>
  transport(url, options) as Promise<T>
const clearLegacy = vi.fn()
function item(id: string, favorite = false): FormulaLibraryItem {
  return {
    id,
    title: id,
    latex: 'x',
    versionNumber: 1,
    createdAt: '2026-11-04T00:00:00Z',
    isMock: false,
    category: null,
    favorite,
  }
}
function page(ids: string[], nextCursor: string | null = null): FormulaLibraryPage {
  return { items: ids.map((id) => item(id)), nextCursor }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
function listing(kind: 'library' | 'favorites' = 'library') {
  let state!: ReturnType<typeof useAccountLibrary>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useAccountLibrary(kind, owner)
        return () => h('div', state.items.value.map((i) => i.id).join(','))
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
  )
  return { wrapper, state }
}
function categories() {
  let state!: ReturnType<typeof useAccountCategories>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useAccountCategories(owner)
        return () => h('div', state.data.value?.totalCount)
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
  )
  return { wrapper, state }
}
beforeEach(() => {
  client = createAccountQueryClient()
  session.value = { user: { id: 'a' } }
  owner.value = 'a'
  route.query = {}
  transport.mockReset()
  clearLegacy.mockReset()
  vi.stubGlobal('useNuxtApp', () => ({ $queryClient: client, $accountFetch: read }))
  vi.stubGlobal('useNuxtData', () => ({ data: session }))
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('clearNuxtData', clearLegacy)
})
afterEach(() => {
  client.clear()
  vi.unstubAllGlobals()
})

test('same-key list consumers share one request and a fresh remount reuses its cache', async () => {
  const pending = deferred<FormulaLibraryPage>()
  transport.mockReturnValue(pending.promise)
  const first = listing(),
    second = listing()
  expect(transport).toHaveBeenCalledTimes(1)
  pending.resolve(page(['one']))
  await flushPromises()
  expect(first.state.items.value[0]?.id).toBe('one')
  expect(second.state.items.value[0]?.id).toBe('one')
  first.wrapper.unmount()
  second.wrapper.unmount()
  const third = listing()
  await flushPromises()
  expect(third.state.items.value[0]?.id).toBe('one')
  expect(transport).toHaveBeenCalledTimes(1)
})

test('list and picker category consumers share one owner-bound query', async () => {
  const pending = deferred<CategoryCollection>()
  transport.mockReturnValue(pending.promise)
  const first = categories(),
    second = categories()
  expect(transport).toHaveBeenCalledTimes(1)
  pending.resolve({ items: [], totalCount: 3, uncategorizedCount: 3 })
  await flushPromises()
  expect(first.state.data.value?.totalCount).toBe(3)
  expect(second.state.data.value?.totalCount).toBe(3)
  session.value = { user: { id: 'b' } }
  expect(first.state.data.value).toBeUndefined()
})

test('changing filters hides old rows synchronously and late abort-ignoring responses cannot overwrite', async () => {
  const old = deferred<FormulaLibraryPage>(),
    latest = deferred<FormulaLibraryPage>()
  transport.mockImplementation((_url, options) =>
    options.query?.q === 'new' ? latest.promise : old.promise,
  )
  const view = listing()
  route.query = { q: 'new' }
  expect(view.state.items.value).toEqual([])
  await nextTick()
  expect(transport.mock.calls[0]![1].signal.aborted).toBe(true)
  latest.resolve(page(['new']))
  await flushPromises()
  old.resolve(page(['old']))
  await flushPromises()
  expect(view.state.items.value.map((i) => i.id)).toEqual(['new'])
})

test('returning to a previously completed filter uses that filter cache without another request', async () => {
  transport.mockImplementation(async (_url, options) => page([options.query?.q || 'all']))
  const view = listing()
  await flushPromises()
  route.query = { q: 'search' }
  expect(view.state.items.value).toEqual([])
  await flushPromises()
  expect(view.state.items.value[0]?.id).toBe('search')
  route.query = {}
  await flushPromises()
  expect(view.state.items.value[0]?.id).toBe('all')
  expect(transport).toHaveBeenCalledTimes(2)
})

test('cursor pages merge duplicates and concurrent load-more clicks share one in-flight fetch', async () => {
  const more = deferred<FormulaLibraryPage>()
  transport.mockImplementation(async (_url, options) =>
    options.query?.cursor ? more.promise : page(['one'], 'cursor-1'),
  )
  const view = listing()
  await flushPromises()
  const first = view.state.loadMore(),
    second = view.state.loadMore()
  await nextTick()
  expect(transport).toHaveBeenCalledTimes(2)
  more.resolve(page(['one', 'two']))
  await Promise.all([first, second])
  await flushPromises()
  expect(view.state.items.value.map((i) => i.id)).toEqual(['one', 'two'])
  expect(view.state.nextCursor.value).toBeNull()
})

test('a next-page failure keeps rows/cursor and retry uses the same cursor', async () => {
  let fail = true
  transport.mockImplementation(async (_url, options) => {
    if (!options.query?.cursor) return page(['one'], 'cursor-1')
    if (fail) throw new Error('controlled next-page failure')
    return page(['two'])
  })
  const view = listing()
  await flushPromises()
  await view.state.loadMore()
  await flushPromises()
  expect(view.state.items.value.map((i) => i.id)).toEqual(['one'])
  expect(view.state.status.value).toBe('success')
  expect(view.state.feedback.value).toContain('已有公式保留')
  expect(view.state.nextCursor.value).toBe('cursor-1')
  fail = false
  await view.state.loadMore()
  await flushPromises()
  expect(view.state.items.value.map((i) => i.id)).toEqual(['one', 'two'])
  expect(view.state.feedback.value).toBe('')
})

test('owner change hides prior rows before the next tick; clear cancels requests and cannot resurrect the old account', async () => {
  const late = deferred<FormulaLibraryPage>()
  transport
    .mockResolvedValueOnce(page(['private-a']))
    .mockReturnValueOnce(late.promise)
    .mockResolvedValue(page(['private-b']))
  const view = listing()
  await flushPromises()
  const refresh = view.state.reload()
  await nextTick()
  await flushPromises()
  const signal = transport.mock.calls[1]![1].signal
  session.value = { user: { id: 'b' } }
  owner.value = 'b'
  expect(view.state.items.value).toEqual([])
  client.clear()
  await flushPromises()
  expect(signal.aborted).toBe(true)
  late.resolve(page(['late-private-a']))
  await refresh
  await flushPromises()
  expect(view.state.items.value.map((i) => i.id)).toEqual(['private-b'])
  expect(client.getQueryData(formulaQueryKeys.library('a', 'library', {}))).toBeUndefined()
})

test('unconfirmed identity makes no request and never waits for disabled suspense', async () => {
  session.value = { user: null }
  const view = listing(),
    category = categories()
  await Promise.all([view.state.ready, category.state.ready])
  await flushPromises()
  expect(transport).not.toHaveBeenCalled()
  expect(view.state.items.value).toEqual([])
  expect(category.state.data.value).toBeUndefined()
})

test('legacy write notification clears old home/history data and invalidates migrated category/list queries', async () => {
  client.setQueryData(formulaQueryKeys.categories('a'), {
    items: [],
    totalCount: 0,
    uncategorizedCount: 0,
  })
  let invalidate!: ReturnType<typeof useFormulaViewsInvalidation>
  mount(
    defineComponent({
      setup() {
        invalidate = useFormulaViewsInvalidation()
        return () => null
      },
    }),
  )
  invalidate('a')
  await flushPromises()
  expect(clearLegacy).toHaveBeenCalledTimes(1)
  expect(clearLegacy.mock.calls[0]![0]('home-recent')).toBe(true)
  expect(client.getQueryState(formulaQueryKeys.categories('a'))?.isInvalidated).toBe(true)
})

test('authorization failure hides cached list and categories instead of keeping private rows', async () => {
  transport.mockImplementation(async (url) =>
    url.endsWith('/categories')
      ? { items: [], totalCount: 1, uncategorizedCount: 1 }
      : page(['private-a']),
  )
  const view = listing(),
    category = categories()
  await flushPromises()
  expect(view.state.items.value).toHaveLength(1)
  expect(transport.mock.calls.every(([, options]) => options.headers['x-account-id'] === 'a')).toBe(
    true,
  )
  transport.mockRejectedValue(Object.assign(new Error('account changed'), { statusCode: 403 }))
  await Promise.all([view.state.reload(), category.state.refresh()])
  await flushPromises()
  expect(view.state.items.value).toEqual([])
  expect(category.state.data.value).toBeUndefined()
  expect(view.state.status.value).toBe('error')
})
