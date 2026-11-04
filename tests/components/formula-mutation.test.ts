import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { VueQueryPlugin, onlineManager, useQuery } from '@tanstack/vue-query'
import { useAccountMutation } from '../../app/composables/useAccountMutation'
import {
  useFormulaFavoriteMutation,
  useFormulaEditMutation,
  useFormulaDeleteMutation,
  useFormulaCategoryMutation,
  useCategoryMutation,
} from '../../app/composables/useFormulaMutations'
import { useManualFormulaCreation } from '../../app/composables/useManualFormulaCreation'
import {
  createAccountQueryClient,
  formulaQueryKeys,
  type LibraryPages,
} from '../../app/queries/formula-queries'
import type { SavedFormula } from '../../shared/types/workspace'

const session = ref<{ user: { id: string } | null }>({ user: { id: 'a' } })
let client: ReturnType<typeof createAccountQueryClient>
const transport = vi.fn(),
  clearLegacy = vi.fn()
function pending<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}
function fixture(id = 'one'): SavedFormula {
  return {
    id,
    title: '原名称',
    createdAt: '',
    updatedAt: '',
    image: null,
    versions: [],
    category: null,
    favorite: false,
  }
}
function host<T>(setup: () => T) {
  let state!: T
  const wrapper = mount(
    defineComponent({
      setup() {
        state = setup()
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
  )
  return { state, wrapper }
}
function cache(owner: string, kind: 'library' | 'favorites', q = '') {
  const key = formulaQueryKeys.library(owner, kind, { q })
  const formula = fixture()
  client.setQueryData<LibraryPages>(key, {
    pages: [
      {
        items: [
          {
            id: formula.id,
            title: formula.title,
            latex: 'x',
            versionNumber: 1,
            createdAt: '',
            isMock: false,
            category: null,
            favorite: true,
          },
        ],
        nextCursor: null,
      },
    ],
    pageParams: [null],
  })
  return key
}
beforeEach(() => {
  client = createAccountQueryClient()
  session.value = { user: { id: 'a' } }
  transport.mockReset()
  clearLegacy.mockReset()
  sessionStorage.clear()
  vi.stubGlobal('useNuxtApp', () => ({ $queryClient: client, $accountFetch: transport }))
  vi.stubGlobal('useNuxtData', () => ({ data: session }))
  vi.stubGlobal('clearNuxtData', clearLegacy)
})
afterEach(() => {
  onlineManager.setOnline(true)
  client.clear()
  vi.unstubAllGlobals()
})

test('synchronous duplicate calls send only once, stay pending and do not auto retry a failure', async () => {
  const response = pending<string>(),
    write = vi.fn(() => response.promise),
    success = vi.fn()
  const { state } = host(() => useAccountMutation('test', write, success))
  const first = state.execute('input')
  await expect(state.execute('duplicate')).rejects.toMatchObject({ name: 'AbortError' })
  await flushPromises()
  expect(write).toHaveBeenCalledTimes(1)
  expect(state.busy.value).toBe(true)
  response.resolve('saved')
  expect(await first).toBe('saved')
  expect(success).toHaveBeenCalledExactlyOnceWith('saved', 'input', 'a')
  write.mockRejectedValueOnce(new Error('offline'))
  await expect(state.execute('next')).rejects.toThrow('offline')
  expect(write).toHaveBeenCalledTimes(2)
  expect(state.busy.value).toBe(false)
})

test('offline writes execute once and fail immediately, never replay when online returns', async () => {
  onlineManager.setOnline(false)
  const write = vi.fn().mockRejectedValue(new Error('network'))
  const { state } = host(() => useAccountMutation('test', write))
  await expect(state.execute('x')).rejects.toThrow('network')
  onlineManager.setOnline(true)
  await flushPromises()
  expect(write).toHaveBeenCalledTimes(1)
})

for (const boundary of ['owner', 'unmount'] as const)
  test(
    boundary + ' aborts old write and rejects late success without cache callbacks',
    async () => {
      const response = pending<string>(),
        success = vi.fn()
      let signal!: AbortSignal
      const { state, wrapper } = host(() =>
        useAccountMutation(
          'test',
          async (_input: string, context) => {
            signal = context.signal
            return response.promise
          },
          success,
        ),
      )
      const result = state.execute('x'),
        rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
      await flushPromises()
      if (boundary === 'owner') session.value = { user: { id: 'b' } }
      else wrapper.unmount()
      expect(signal.aborted).toBe(true)
      response.resolve('late')
      await rejected
      expect(success).not.toHaveBeenCalled()
    },
  )

test('unconfirmed account refuses a write before transport', async () => {
  session.value = { user: null }
  const write = vi.fn(),
    { state } = host(() => useAccountMutation('test', write))
  await expect(state.execute('x')).rejects.toMatchObject({ name: 'AbortError' })
  expect(write).not.toHaveBeenCalled()
})

test('server-confirmed unfavorite updates all own list variants and leaves the other owner untouched', async () => {
  const all = cache('a', 'library'),
    filtered = cache('a', 'library', 'x'),
    favorites = cache('a', 'favorites'),
    other = cache('b', 'favorites')
  const response = pending<{ favorite: boolean }>()
  transport.mockReturnValue(response.promise)
  const { state } = host(useFormulaFavoriteMutation)
  const request = state.execute({ id: 'one', favorite: false })
  await flushPromises()
  expect(client.getQueryData<LibraryPages>(all)?.pages[0]?.items[0]?.favorite).toBe(true)
  response.resolve({ favorite: false })
  await request
  for (const key of [all, filtered]) {
    expect(client.getQueryData<LibraryPages>(key)?.pages[0]?.items[0]?.favorite).toBe(false)
    expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  }
  expect(client.getQueryData<LibraryPages>(favorites)?.pages[0]?.items).toEqual([])
  expect(client.getQueryData<LibraryPages>(other)?.pages[0]?.items).toHaveLength(1)
  expect(clearLegacy).toHaveBeenCalledTimes(1)
  expect(transport.mock.calls[0]?.[1]).toMatchObject({
    method: 'PUT',
    headers: { 'x-account-id': 'a' },
    retry: 0,
  })
})

test('failed favorite leaves server-confirmed cache unchanged and sends no invalidation', async () => {
  const key = cache('a', 'favorites')
  transport.mockRejectedValue(new Error('network'))
  const { state } = host(useFormulaFavoriteMutation)
  await expect(state.execute({ id: 'one', favorite: false })).rejects.toThrow('network')
  expect(client.getQueryData<LibraryPages>(key)?.pages[0]?.items).toHaveLength(1)
  expect(clearLegacy).not.toHaveBeenCalled()
})

test('edit conflict preserves cache, expected revision/title and original request body', async () => {
  const key = cache('a', 'library')
  transport.mockRejectedValue(Object.assign(new Error('conflict'), { statusCode: 409 }))
  const { state } = host(useFormulaEditMutation)
  await expect(
    state.execute({
      id: 'one',
      title: '草稿',
      latex: 'x+1',
      expectedTitle: '原名称',
      expectedVersionId: 'v',
    }),
  ).rejects.toMatchObject({ statusCode: 409 })
  expect(transport.mock.calls[0]?.[1].body).toEqual({
    title: '草稿',
    latex: 'x+1',
    expectedTitle: '原名称',
    expectedVersionId: 'v',
  })
  expect(client.getQueryState(key)?.isInvalidated).toBe(false)
})

test('delete removes own cached entries; category and assignment notify once per successful write', async () => {
  const own = cache('a', 'library'),
    other = cache('b', 'library')
  transport.mockResolvedValue({})
  const { state } = host(() => ({
    deletion: useFormulaDeleteMutation(),
    category: useCategoryMutation(),
    assignment: useFormulaCategoryMutation(),
  }))
  await state.deletion.execute('one')
  expect(client.getQueryData<LibraryPages>(own)?.pages[0]?.items).toEqual([])
  expect(client.getQueryData<LibraryPages>(other)?.pages[0]?.items).toHaveLength(1)
  await state.category.execute({ action: 'create', name: '集合' })
  await state.category.execute({ action: 'rename', id: 'c', name: '改名' })
  await state.category.execute({ action: 'delete', id: 'c' })
  await state.assignment.execute({ id: 'one', categoryId: null })
  expect(clearLegacy).toHaveBeenCalledTimes(5)
  expect(transport.mock.calls.map(([, options]) => options.method)).toEqual([
    'DELETE',
    'POST',
    'PATCH',
    'DELETE',
    'PUT',
  ])
})

test('uncertain create keeps receipt, remount replays exact body/key, success removes receipt', async () => {
  const owner = ref('a')
  transport.mockRejectedValueOnce(new Error('network'))
  const first = host(() => useManualFormulaCreation(owner))
  await expect(first.state.save('原名称', 'x')).rejects.toThrow('network')
  const body = transport.mock.calls[0]?.[1].body
  expect(body.requestKey).toMatch(/^[a-f0-9-]{36}$/)
  expect(JSON.parse(sessionStorage.getItem('formula-manual-creation-recovery-v1')!).input).toEqual(
    body,
  )
  first.wrapper.unmount()
  transport.mockResolvedValue(fixture())
  const second = host(() => useManualFormulaCreation(owner))
  await second.state.save('不应创建新草稿', 'y')
  expect(transport.mock.calls[1]?.[1].body).toEqual(body)
  expect(sessionStorage.getItem('formula-manual-creation-recovery-v1')).toBeNull()
  expect(second.state.receipt.value).toBeNull()
})

test('storage failure refuses create; explicit validation rejection clears its receipt', async () => {
  const owner = ref('a'),
    { state } = host(() => useManualFormulaCreation(owner))
  const storage = vi.spyOn(sessionStorage, 'setItem').mockImplementationOnce(() => {
    throw new Error('storage denied')
  })
  await expect(state.save('名称', 'x')).rejects.toThrow('storage denied')
  expect(transport).not.toHaveBeenCalled()
  storage.mockRestore()
  transport.mockRejectedValue(Object.assign(new Error('invalid'), { statusCode: 400 }))
  await expect(state.save('名称', 'x')).rejects.toMatchObject({ statusCode: 400 })
  expect(state.receipt.value).toBeNull()
})

test('confirmed favorite cancels an old list refresh even when its transport ignores abort', async () => {
  const key = cache('a', 'library'),
    late = pending<LibraryPages>()
  const prior = client.getQueryData<LibraryPages>(key)!
  const refresh = client
    .fetchQuery({ queryKey: key, queryFn: () => late.promise, staleTime: 0 })
    .catch(() => undefined)
  transport.mockResolvedValue({ favorite: false })
  const { state } = host(useFormulaFavoriteMutation)
  await state.execute({ id: 'one', favorite: false })
  late.resolve(prior)
  await refresh
  await flushPromises()
  expect(client.getQueryData<LibraryPages>(key)?.pages[0]?.items[0]?.favorite).toBe(false)
})

test('a changed expected create owner aborts in-flight work and retains the uncertain receipt', async () => {
  const owner = ref('a'),
    response = pending<SavedFormula>()
  transport.mockReturnValue(response.promise)
  const { state } = host(() => useManualFormulaCreation(owner))
  const result = state.save('名称', 'x'),
    rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
  await flushPromises()
  owner.value = 'b'
  expect(transport.mock.calls[0]?.[1].signal.aborted).toBe(true)
  response.resolve(fixture())
  await rejected
  expect(sessionStorage.getItem('formula-manual-creation-recovery-v1')).not.toBeNull()
  expect(clearLegacy).not.toHaveBeenCalled()
})

test('a failed background refresh does not turn a confirmed write into a failed mutation', async () => {
  const key = cache('a', 'library')
  transport.mockResolvedValue({ favorite: false })
  const { state } = host(() => ({
    read: useQuery(
      {
        queryKey: key,
        queryFn: async () => {
          throw new Error('read unavailable')
        },
        staleTime: Infinity,
      },
      client,
    ),
    write: useFormulaFavoriteMutation(),
  }))
  await expect(state.write.execute({ id: 'one', favorite: false })).resolves.toEqual({
    favorite: false,
  })
  await flushPromises()
  expect(state.read.error.value?.message).toBe('read unavailable')
  expect(state.write.error.value).toBeNull()
})
