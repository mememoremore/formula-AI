import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { ref, toRef } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import Card from '../../app/components/GeneratedRecommendationCard.vue'
import type { GeneratedRecommendation } from '../../shared/recommendations'
const fetcher = vi.fn(),
  invalidate = vi.fn()
vi.mock('../../app/composables/useAccountMutation', () => ({
  isAccountWriteCancelled: (e: Error) => e.name === 'AbortError',
  useAccountMutation: (
    _operation: string,
    write: (input: unknown, context: unknown) => Promise<{ id: string }>,
    success: (result: { id: string }, input: unknown, owner: string) => void,
  ) => {
    const busy = ref(false)
    return {
      busy,
      execute: async (input: unknown) => {
        busy.value = true
        try {
          const r = await write(input, { owner: 'owner', signal: new AbortController().signal })
          success(r, input, 'owner')
          return r
        } finally {
          busy.value = false
        }
      },
    }
  },
}))
const item: GeneratedRecommendation = {
  id: '00000000-0000-4000-8000-000000000002',
  kind: 'DERIVATION',
  title: '推导公式',
  latex: 'x=2',
  reason: '由原式推导',
  sourceIds: ['source'],
  sources: [{ id: 'source', title: '来源', latex: 'x+1=3' }],
  conditions: '实数范围',
  steps: [
    { latex: 'x+1=3', explanation: '来源方程' },
    { latex: 'x=2', explanation: '两边减一' },
  ],
}
function card() {
  return mount(Card, {
    props: { ownerId: 'owner', item },
    global: {
      stubs: {
        MathFormula: { props: ['latex'], template: '<div class="math">{{latex}}</div>' },
        NuxtLink: { props: ['to'], template: '<a :href="to"><slot/></a>' },
      },
    },
  })
}
beforeEach(() => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('toRef', toRef)
  vi.stubGlobal('useAccountFetch', () => fetcher)
  vi.stubGlobal('useFormulaViewsInvalidation', () => invalidate)
  fetcher.mockReset()
  invalidate.mockReset()
})
afterEach(() => vi.unstubAllGlobals())
test('新公式展示来源、条件与两步推导，不自动保存或把生成ID当公式链接', () => {
  const w = card()
  expect(w.text()).toContain('连续推导')
  expect(w.text()).toContain('AI生成 · 待核对')
  expect(w.text()).toContain('实数范围')
  expect(w.findAll('li')).toHaveLength(2)
  expect(w.get('.source-formula').attributes('href')).toBe('/formulas/source')
  expect(w.find('a[href="/formulas/' + item.id + '"]').exists()).toBe(false)
  expect(fetcher).not.toHaveBeenCalled()
})
test('保存复用现有接口及稳定请求编号，成功后显示真实公式链接且更新列表', async () => {
  fetcher.mockResolvedValue({ id: 'saved' })
  const w = card()
  await w.get('button').trigger('click')
  await flushPromises()
  expect(fetcher).toHaveBeenCalledWith(
    '/api/account/formulas',
    expect.objectContaining({
      body: { title: item.title, latex: item.latex, requestKey: item.id },
      headers: { 'x-account-id': 'owner' },
      retry: 0,
    }),
  )
  expect(w.get('a.text-button').attributes('href')).toBe('/formulas/saved')
  expect(w.find('button').exists()).toBe(false)
  expect(invalidate).toHaveBeenCalledWith('owner')
})
test('未知保存结果重试沿用原请求编号，防止再创建一条公式', async () => {
  fetcher.mockRejectedValueOnce(new Error('unknown')).mockResolvedValueOnce({ id: 'saved' })
  const w = card()
  await w.get('button').trigger('click')
  await flushPromises()
  expect(w.get('[role="alert"]').text()).toBeTruthy()
  await w.get('button').trigger('click')
  await flushPromises()
  expect(fetcher.mock.calls[0]![1].body).toEqual(fetcher.mock.calls[1]![1].body)
})
test('保存等待期间禁用按钮', async () => {
  let finish!: (value: { id: string }) => void
  fetcher.mockImplementation(
    () =>
      new Promise((r) => {
        finish = r
      }),
  )
  const w = card()
  await w.get('button').trigger('click')
  expect(w.get('button').attributes('disabled')).toBeDefined()
  finish({ id: 'saved' })
  await flushPromises()
  expect(w.text()).toContain('已添加')
})
