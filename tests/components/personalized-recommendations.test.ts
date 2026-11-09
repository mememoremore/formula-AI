import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import Recommendations from '../../app/components/PersonalizedRecommendations.vue'
import type { RecommendationView } from '../../shared/recommendations'
const fetcher = vi.fn()
let data: Ref<RecommendationView>
const initial = (): RecommendationView => ({
  fingerprint: 'a'.repeat(64),
  status: 'READY',
  source: 'AI',
  canGenerate: true,
  warning: null,
  profile: { grade: '高一', learningPurpose: '理解公式' },
  items: [1, 2, 3].map((index) => ({
    id: 'new' + index,
    kind: 'DERIVATION',
    title: '新公式' + index,
    latex: 'x=' + index,
    reason: '推导理由',
    conditions: '实数',
    sourceIds: ['source'],
    sources: [{ id: 'source', title: '来源', latex: 'x+1=3' }],
    steps: [
      { latex: 'x+1=3', explanation: '原式' },
      { latex: 'x=2', explanation: '移项' },
    ],
  })),
})
function panel() {
  return mount(Recommendations, {
    props: { ownerId: 'owner' },
    global: {
      stubs: {
        AppIcon: true,
        GeneratedRecommendationCard: {
          props: ['item'],
          template:
            '<div class="generated"><h3>{{item.title}}</h3><span>{{item.latex}}</span></div>',
        },
        EmptyState: { props: ['title'], template: '<div class="empty">{{title}}</div>' },
      },
    },
  })
}
beforeEach(() => {
  for (const [k, v] of Object.entries({ computed, onScopeDispose, ref, watch })) vi.stubGlobal(k, v)
  data = ref(initial())
  vi.stubGlobal('useAccountFetch', () => fetcher)
  vi.stubGlobal('useTaskPolling', () => ({ data, error: ref(null), refresh: vi.fn() }))
  vi.stubGlobal('clearNuxtData', vi.fn())
  fetcher.mockReset()
})
afterEach(() => vi.unstubAllGlobals())
test('仅显示新公式单卡，移除掌握提示和底部生成入口', () => {
  const w = panel()
  expect(w.findAll('.generated')).toHaveLength(1)
  expect(w.text()).toContain('新公式1')
  expect(w.text()).not.toContain('尚未掌握')
  expect(w.text()).not.toContain('生成个性化推荐')
  expect(w.find('.recommendation-actions').exists()).toBe(false)
  expect(fetcher).not.toHaveBeenCalled()
})
test('换一个轮换缓存的新公式，不重新调用AI', async () => {
  const w = panel()
  for (const text of ['新公式2', '新公式3', '新公式1']) {
    await w.get('button').trigger('click')
    expect(w.get('h3').text()).toBe(text)
  }
  expect(fetcher).not.toHaveBeenCalled()
})
test('未生成和生成失败均不展示库内公式，点击换一个才生成', async () => {
  data.value = {
    ...initial(),
    status: 'PREVIEW',
    source: 'RULES',
    items: [{ id: 'existing', title: '库内公式', latex: 'x=9', reason: '尚未掌握' }],
  }
  fetcher.mockResolvedValue(initial())
  const w = panel()
  expect(w.find('.generated').exists()).toBe(false)
  expect(w.text()).not.toContain('库内公式')
  expect(fetcher).not.toHaveBeenCalled()
  await w.get('button').trigger('click')
  await flushPromises()
  expect(w.get('h3').text()).toBe('新公式1')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
test('失败后无库内回退，允许显式重试', async () => {
  data.value = { ...initial(), status: 'FAILED', items: [] }
  fetcher.mockResolvedValue(initial())
  const w = panel()
  await w.get('button').trigger('click')
  await flushPromises()
  expect(fetcher.mock.calls[0]![1].body.retry).toBe(true)
})
test('空库和未配置AI不能发起生成；处理中禁用换一个', () => {
  for (const value of [
    { ...initial(), status: 'EMPTY' as const, items: [] },
    { ...initial(), status: 'PREVIEW' as const, items: [], canGenerate: false },
    { ...initial(), status: 'PROCESSING' as const, items: [] },
  ]) {
    data.value = value
    const w = panel()
    expect(w.get('button').attributes('disabled')).toBeDefined()
    w.unmount()
  }
})
test('上下文更新重置首条，只有一条新公式时禁止空轮换', async () => {
  const w = panel()
  await w.get('button').trigger('click')
  data.value = {
    ...initial(),
    fingerprint: 'b'.repeat(64),
    items: [{ ...initial().items[0]!, id: 'other', title: '更新的新公式' }],
  }
  await flushPromises()
  expect(w.get('h3').text()).toBe('更新的新公式')
  expect(w.get('button').attributes('disabled')).toBeDefined()
})
