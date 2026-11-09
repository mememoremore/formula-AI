import { test, expect, beforeEach, afterEach, vi } from 'vitest'
import { computed, defineComponent, h, onMounted, onScopeDispose, ref, watch, Suspense } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import Review from '../../app/pages/review.vue'
const transport = vi.fn(),
  wrappers: ReturnType<typeof mount>[] = []
const base = {
  revision: 0,
  notes: '个人笔记',
  conditions: '独立适用条件',
  question: '',
  tags: [],
  questionsInitialized: true,
  conditionsCustomized: true,
  mastery: 'UNFAMILIAR',
  masteryNotes: '',
  reviewEnabled: true,
  nextReviewAt: null,
  intervalDays: 0,
}
const a = {
  id: 'a',
  title: '第一条',
  category: '物理',
  latex: 'h=gt^2/2',
  imageId: 'original-image',
  learning: {
    ...base,
    questions: [{ id: 'q', question: '思考这个问题', answer: '隐藏的答案', source: 'manual' }],
  },
}
const b = { ...a, id: 'b', title: '第二条', imageId: null, latex: 'a=b' }
async function page() {
  const wrapper = mount(
    defineComponent({ setup: () => () => h(Suspense, {}, { default: () => h(Review) }) }),
    {
      global: {
        stubs: {
          MathFormula: { props: ['latex'], template: '<div class="test-math">{{ latex }}</div>' },
          PageHeader: true,
          EmptyState: { props: ['title'], template: '<p>{{ title }}</p>' },
          NuxtLink: { template: '<a><slot /></a>' },
        },
      },
    },
  )
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  for (const [name, value] of Object.entries({ ref, computed, watch, onMounted, onScopeDispose }))
    vi.stubGlobal(name, value)
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useHead', vi.fn())
  vi.stubGlobal('useAccountSession', async () => ({ data: ref({ user: { id: 'owner' } }) }))
  vi.stubGlobal('useAccountFetch', () => transport)
  vi.stubGlobal('useAsyncData', async (_key: string, read: () => Promise<unknown>) => {
    const data = ref(await read()),
      error = ref(null),
      status = ref('success')
    return {
      data,
      error,
      status,
      refresh: async () => {
        data.value = await read()
      },
    }
  })
  transport
    .mockReset()
    .mockImplementation(async (_url, options) =>
      options?.method === 'POST' ? {} : { items: options?.query?.all === 'true' ? [a, b] : [a] },
    )
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})
test('先显示公式图片和问题，核对后才展示答案、条件和自评', async () => {
  const wrapper = await page()
  expect(wrapper.find('.review-formula img').attributes('src')).toContain('original-image')
  expect(wrapper.text()).toContain('回忆适用条件并回答以下问题，思考完再查看答案')
  expect(wrapper.text()).toContain('思考这个问题')
  expect(wrapper.text()).not.toContain('隐藏的答案')
  expect(wrapper.find('.review-conditions').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('重新读取卡片')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '查看答案')!
    .trigger('click')
  expect(wrapper.text()).toContain('隐藏的答案')
  expect(wrapper.find('.review-conditions').text()).toContain('独立适用条件')
  expect(wrapper.text()).toContain('会了 · 延后复习')
})
test('提前复习开关加入未来卡片，进入下一条后重新隐藏答案；原图失败回退数学公式', async () => {
  const wrapper = await page()
  await wrapper.find('.review-formula img').trigger('error')
  expect(wrapper.find('.review-formula .test-math').exists()).toBe(true)
  await wrapper.find('input[type=checkbox]').setValue(true)
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '查看答案')!
    .trigger('click')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '会了 · 延后复习')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('第二条')
  expect(wrapper.find('.review-answer').exists()).toBe(false)
  expect(wrapper.find('.review-formula .test-math').text()).toBe('a=b')
})
