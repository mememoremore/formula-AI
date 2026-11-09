import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { defineComponent, h, onMounted, onScopeDispose, ref, Suspense } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import FormulaLearningPanel from '../../app/components/FormulaLearningPanel.vue'
import type { FormulaLearningView } from '../../shared/schemas/learning'

const fetcher = vi.fn(),
  invalidate = vi.fn()
const ai = [1, 2, 3].map((i) => ({
  id: '00000000-0000-4000-8000-00000000000' + i,
  question: 'AI问题' + i,
  answer: 'AI答案' + i,
  source: 'ai' as const,
}))
const initial = (): FormulaLearningView => ({
  revision: 0,
  notes: '',
  conditions: '已有AI适用条件',
  question: '',
  tags: [],
  questions: [],
  questionsInitialized: false,
  conditionsCustomized: false,
  mastery: 'UNFAMILIAR',
  masteryNotes: '',
  reviewEnabled: false,
  nextReviewAt: null,
  intervalDays: 0,
})
const Export = defineComponent({
  props: ['ids', 'disabled', 'prepare'],
  setup: (props) => () =>
    h('button', { disabled: props.disabled, onClick: () => props.prepare?.() }, '生成学习清单'),
})
const wrappers: ReturnType<typeof mount>[] = []
async function panel() {
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(
          Suspense,
          {},
          { default: () => h(FormulaLearningPanel, { formulaId: 'formula', ownerId: 'owner' }) },
        ),
    }),
    { global: { stubs: { StudySheetExport: Export, AppIcon: true } } },
  )
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('onMounted', onMounted)
  vi.stubGlobal('onScopeDispose', onScopeDispose)
  vi.stubGlobal('useAccountFetch', () => fetcher)
  vi.stubGlobal('useToast', () => ({ showToast: vi.fn() }))
  vi.stubGlobal('useFormulaViewsInvalidation', () => invalidate)
  vi.stubGlobal('clearNuxtData', vi.fn())
  vi.stubGlobal('useAsyncData', async (_: string, read: () => Promise<FormulaLearningView>) => ({
    data: ref(await read()),
    error: ref(null),
  }))
  fetcher
    .mockReset()
    .mockImplementation(async (url: string, options?: { method?: string; body?: unknown }) => {
      if (url.endsWith('/learning-questions'))
        return { status: 'READY', questions: ai, error: null }
      if (options?.method === 'PUT')
        return {
          ...initial(),
          ...(options.body as object),
          questionsInitialized: true,
          revision: 1,
        }
      return initial()
    })
  invalidate.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

test('进入页面不请求AI，点击AI提问才生成三组问答，手动问题按需添加', async () => {
  const wrapper = await panel()
  expect(wrapper.findAll('.question-card')).toHaveLength(0)
  expect(fetcher.mock.calls.some(([url]) => url.endsWith('/learning-questions'))).toBe(false)
  expect(wrapper.findAll('.questions-heading button').map((button) => button.text())).toEqual([
    'AI提问',
    '添加问题',
  ])
  await wrapper.findAll('.questions-heading button')[0]!.trigger('click')
  await flushPromises()
  expect(wrapper.findAll('.question-card')).toHaveLength(3)
  expect(wrapper.findAll('.learning-actions button').map((button) => button.text())).toEqual([
    '保存学习笔记',
    '生成学习清单',
  ])
  expect(wrapper.text()).not.toContain('重新读取')
  expect(wrapper.text()).not.toContain('开始复习')
  expect(wrapper.text()).not.toContain('标签')
  await wrapper.findAll('.questions-heading button')[1]!.trigger('click')
  expect(wrapper.findAll('.question-card')).toHaveLength(4)
  expect(wrapper.find('[aria-label="问题4"]').element).toHaveProperty('value', '')
  expect(wrapper.find('[aria-label="答案4"]').element).toHaveProperty('value', '')
})

test('AI响应晚到仍保留用户已添加的问题与答案', async () => {
  let resolve!: (value: unknown) => void
  const normal = fetcher.getMockImplementation()!
  fetcher.mockImplementation((url, options) =>
    url.endsWith('/learning-questions')
      ? new Promise((done) => {
          resolve = done
        })
      : normal(url, options),
  )
  const wrapper = await panel()
  await wrapper.findAll('.questions-heading button')[0]!.trigger('click')
  await flushPromises()
  expect(wrapper.findAll('.questions-heading button')[0]!.attributes('disabled')).toBeDefined()
  await wrapper.findAll('.questions-heading button')[1]!.trigger('click')
  await wrapper.find('[aria-label="问题1"]').setValue('我的问题')
  await wrapper.find('[aria-label="答案1"]').setValue('我的答案')
  resolve({ status: 'READY', questions: ai, error: null })
  await flushPromises()
  expect(wrapper.findAll('.question-card')).toHaveLength(4)
  expect(wrapper.find('[aria-label="问题4"]').element).toHaveProperty('value', '我的问题')
  expect(wrapper.find('[aria-label="答案4"]').element).toHaveProperty('value', '我的答案')
})

test('熟练度切换控制备注显示，手动修改条件及问答随保存提交', async () => {
  const wrapper = await panel()
  await wrapper.find('[aria-label="熟练度备注"]').setValue('需要理解符号')
  await wrapper.find('[aria-label="公式熟练度"]').setValue('MASTERED')
  expect(wrapper.find('[aria-label="熟练度备注"]').exists()).toBe(false)
  await wrapper.find('[aria-label="公式熟练度"]').setValue('UNFAMILIAR')
  expect(wrapper.find('[aria-label="熟练度备注"]').element).toHaveProperty('value', '需要理解符号')
  await wrapper.find('[aria-label="公式适用条件"]').setValue('自定义条件')
  await wrapper.find('.learning-actions button').trigger('click')
  await flushPromises()
  const write = fetcher.mock.calls.find(([, options]) => options?.method === 'PUT')![1].body
  expect(write).toMatchObject({
    mastery: 'UNFAMILIAR',
    masteryNotes: '需要理解符号',
    conditions: '自定义条件',
    conditionsCustomized: true,
    questions: [],
  })
  expect(write.tags).toBeUndefined()
})

test('已保存的问答不自动生成，保存冲突保留输入内容', async () => {
  fetcher.mockImplementation(async (_url, options) => {
    if (options?.method === 'PUT') throw Object.assign(new Error('版本冲突'), { statusCode: 409 })
    return { ...initial(), questions: ai, questionsInitialized: true }
  })
  const wrapper = await panel()
  expect(fetcher.mock.calls.some(([url]) => url.endsWith('/learning-questions'))).toBe(false)
  await wrapper.find('[aria-label="公式个人笔记"]').setValue('保留未保存笔记')
  await wrapper.find('.learning-actions button').trigger('click')
  await flushPromises()
  expect(wrapper.find('[aria-label="公式个人笔记"]').element).toHaveProperty(
    'value',
    '保留未保存笔记',
  )
  expect(wrapper.find('.error-text').exists()).toBe(true)
})

test('手动添加问题与保存都不会触发AI请求', async () => {
  const wrapper = await panel()
  await wrapper.findAll('.questions-heading button')[1]!.trigger('click')
  await wrapper.find('[aria-label="问题1"]').setValue('手动问题')
  await wrapper.find('[aria-label="答案1"]').setValue('手动答案')
  await wrapper.find('.learning-actions button').trigger('click')
  await flushPromises()
  expect(fetcher.mock.calls.some(([url]) => url.endsWith('/learning-questions'))).toBe(false)
  const write = fetcher.mock.calls.find(([, options]) => options?.method === 'PUT')![1].body
  expect(write.questions).toEqual([
    expect.objectContaining({ question: '手动问题', answer: '手动答案', source: 'manual' }),
  ])
})

test('AI失败后通过同一按钮重试，并保留手动问题', async () => {
  const normal = fetcher.getMockImplementation()!
  let attempts = 0
  fetcher.mockImplementation((url, options) => {
    if (!url.endsWith('/learning-questions')) return normal(url, options)
    attempts++
    return Promise.resolve(
      attempts === 1
        ? { status: 'FAILED', questions: [], error: '暂时失败' }
        : { status: 'READY', questions: ai, error: null },
    )
  })
  const wrapper = await panel()
  await wrapper.findAll('.questions-heading button')[0]!.trigger('click')
  await flushPromises()
  expect(wrapper.find('[role="alert"]').text()).toBe('暂时失败')
  await wrapper.findAll('.questions-heading button')[0]!.trigger('click')
  await flushPromises()
  expect(
    fetcher.mock.calls
      .filter(([url]) => url.endsWith('/learning-questions'))
      .map(([, options]) => options.body.retry),
  ).toEqual([false, true])
  expect(wrapper.findAll('.question-card')).toHaveLength(3)
})
