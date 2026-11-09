import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import ChatFormulaImage from '../../app/components/ChatFormulaImage.vue'

const fetcher = vi.fn()
const id = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  for (const [key, value] of Object.entries({ ref, shallowRef, watch, onScopeDispose }))
    vi.stubGlobal(key, value)
  vi.stubGlobal('useAccountFetch', () => fetcher)
  vi.stubGlobal('clearNuxtData', vi.fn())
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  fetcher.mockReset().mockImplementation(async (url: string) => {
    if (url === '/api/account/files') return { image: { id } }
    if (url === '/api/account/recognitions')
      return { id: 'task', status: 'COMPLETED', formulaId: 'formula' }
    if (url === '/api/account/formulas/formula')
      return { versions: [{ latex: String.raw`h=\frac{1}{2}gt^2` }] }
    throw new Error('Unexpected route: ' + url)
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
async function picker(remaining = 2000) {
  const wrapper = mount(ChatFormulaImage, {
    props: { ownerId: 'owner', remaining },
    global: { stubs: { AppIcon: true, NuxtLink: true } },
  })
  const input = wrapper.get('input')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [new File(['image'], 'formula.png', { type: 'image/png' })],
  })
  await input.trigger('change')
  return wrapper
}
const recognizeButton = (wrapper: Awaited<ReturnType<typeof picker>>) =>
  wrapper
    .findAll('button')
    .find((button) => button.text().includes('插入') && button.classes().includes('button'))!

test('先展示图片不自动使用额度，点击识别才上传；插入保留私有图片与公式源码', async () => {
  const wrapper = await picker()
  expect(wrapper.find('.image-preparation img').exists()).toBe(true)
  expect(fetcher).not.toHaveBeenCalled()
  await recognizeButton(wrapper).trigger('click')
  await flushPromises()
  expect(wrapper.emitted('insert')?.[0]?.[0]).toContain(
    '![公式图片](/api/account/files/' + id + '/content)',
  )
  expect(wrapper.emitted('insert')?.[0]?.[0]).toContain(String.raw`$$h=\frac{1}{2}gt^2$$`)
  expect(wrapper.find('.image-preparation').exists()).toBe(false)
  expect(wrapper.emitted('pending')?.at(-1)).toEqual([false])
})

test('识别提交响应丢失后沿用原请求编号；不重复上传或换模式', async () => {
  const normal = fetcher.getMockImplementation()!
  let calls = 0
  fetcher.mockImplementation((url, options) => {
    if (url === '/api/account/recognitions' && ++calls === 1)
      return Promise.reject(new Error('网络中断'))
    return normal(url, options)
  })
  const wrapper = await picker()
  await recognizeButton(wrapper).trigger('click')
  await flushPromises()
  expect(wrapper.find('[role=alert]').exists()).toBe(true)
  expect(wrapper.get('select').attributes('disabled')).toBeDefined()
  await recognizeButton(wrapper).trigger('click')
  await flushPromises()
  const submits = fetcher.mock.calls.filter(([url]) => url === '/api/account/recognitions')
  expect(submits).toHaveLength(2)
  expect(submits[0]![1].body.requestKey).toBe(submits[1]![1].body.requestKey)
  expect(fetcher.mock.calls.filter(([url]) => url === '/api/account/files')).toHaveLength(1)
})

test('排队任务通过原任务读取接口轮询，完成后插入', async () => {
  vi.useFakeTimers()
  const normal = fetcher.getMockImplementation()!
  fetcher.mockImplementation((url, options) => {
    if (url === '/api/account/recognitions')
      return Promise.resolve({ id: 'task', status: 'QUEUED' })
    if (url === '/api/account/tasks/task')
      return Promise.resolve({ id: 'task', status: 'COMPLETED', formulaId: 'formula' })
    return normal(url, options)
  })
  const wrapper = await picker()
  await recognizeButton(wrapper).trigger('click')
  await flushPromises()
  await vi.advanceTimersByTimeAsync(1500)
  await flushPromises()
  expect(fetcher.mock.calls.some(([url]) => url === '/api/account/tasks/task')).toBe(true)
  expect(wrapper.emitted('insert')).toHaveLength(1)
})

test('合计超长时不插入，缩短提问后复用结果而不重复识别', async () => {
  const wrapper = await picker(5)
  await recognizeButton(wrapper).trigger('click')
  await flushPromises()
  expect(wrapper.emitted('insert')).toBeUndefined()
  expect(wrapper.find('[role=alert]').text()).toContain('2000')
  await wrapper.setProps({ remaining: 2000 })
  await recognizeButton(wrapper).trigger('click')
  await flushPromises()
  expect(wrapper.emitted('insert')).toHaveLength(1)
  expect(fetcher.mock.calls.filter(([url]) => url === '/api/account/recognitions')).toHaveLength(1)
})
