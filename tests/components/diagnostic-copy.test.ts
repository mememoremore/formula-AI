import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { reactive, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import DiagnosticCopy from '../../app/components/DiagnosticCopy.vue'

const diagnostic = ref<{ traceId: string; path: string; time: string } | null>(null)
const route = reactive({ path: '/library', query: '' })
beforeEach(() => {
  diagnostic.value = { traceId: 'test-trace', path: '/library', time: '2026-11-04' }
  route.path = '/library'
  route.query = ''
  vi.stubGlobal('useState', () => diagnostic)
  vi.stubGlobal('useRoute', () => route)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
test('copies the exact diagnostic and lets the user dismiss it', async () => {
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  const wrapper = mount(DiagnosticCopy)
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(JSON.parse(copy.mock.calls[0]![0])).toEqual(diagnostic.value)
  expect(wrapper.text()).toContain('诊断信息已复制')
  expect(wrapper.attributes('role')).toBe('status')
  await wrapper.get('[aria-label="关闭诊断提示"]').trigger('click')
  expect(diagnostic.value).toBeNull()
  expect(wrapper.find('.diagnostic-copy').exists()).toBe(false)
})
test('clipboard failure retains the diagnostic; a new error resets copied state', async () => {
  const copy = vi
    .spyOn(navigator.clipboard, 'writeText')
    .mockRejectedValueOnce(new Error('denied'))
    .mockResolvedValue()
  const wrapper = mount(DiagnosticCopy)
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('复制诊断信息')
  expect(diagnostic.value?.traceId).toBe('test-trace')
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(copy).toHaveBeenCalledTimes(2)
  diagnostic.value = { traceId: 'new-trace', path: '/library', time: 'later' }
  await flushPromises()
  expect(wrapper.text()).not.toContain('诊断信息已复制')
})
test('filter changes preserve context, navigation clears the old page diagnostic', async () => {
  const wrapper = mount(DiagnosticCopy)
  route.query = 'q=x'
  await flushPromises()
  expect(wrapper.find('.diagnostic-copy').exists()).toBe(true)
  route.path = '/formulas/new'
  await flushPromises()
  expect(diagnostic.value).toBeNull()
  expect(wrapper.find('.diagnostic-copy').exists()).toBe(false)
})
