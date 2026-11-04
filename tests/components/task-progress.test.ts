import { test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TaskProgress from '../../app/components/TaskProgress.vue'
import type { TaskState } from '../../shared/types/tasks'

function progress(
  status: TaskState['status'],
  extra: { errorMessage?: string; warning?: boolean; heading?: string; description?: string } = {},
) {
  const { errorMessage = null, ...props } = extra
  const task: TaskState = { id: 'task', status, attemptCount: 1, maxAttempts: 3, errorMessage }
  return mount(TaskProgress, {
    props: { task, title: '公式识别', ...props },
    global: { stubs: { AppIcon: true, PaperArtwork: true } },
  })
}

test.each(['QUEUED', 'PROCESSING'] as const)(
  '%s displays active state without pretending to show a precise progress percentage',
  (status) => {
    const wrapper = progress(status)
    expect(wrapper.get('h2').text()).toBe(status === 'QUEUED' ? '正在排队' : '正在处理')
    expect(wrapper.get('.task-ring').classes()).toContain('waiting')
    expect(wrapper.find('.info-note').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/\d+%/)
    expect(wrapper.attributes('aria-live')).toBe('polite')
  },
)

test('completed state stops animation and confirms persisted result', () => {
  const wrapper = progress('COMPLETED')
  expect(wrapper.get('h2').text()).toBe('处理完成')
  expect(wrapper.get('.task-ring').classes()).not.toContain('waiting')
  expect(wrapper.text()).toContain('结果已保存在你的账号。')
})

test('failed state preserves the recovery guidance and actual error', () => {
  const wrapper = progress('FAILED', { errorMessage: '识别超时，请重试。' })
  expect(wrapper.classes()).toContain('failed')
  expect(wrapper.text()).toContain('已保留原始资料')
  expect(wrapper.get('.error-text').text()).toBe('识别超时，请重试。')
  expect(wrapper.get('.task-ring').classes()).not.toContain('waiting')
})

test('a warning uses the provided heading and explanation without claiming success', () => {
  const wrapper = progress('COMPLETED', {
    warning: true,
    heading: '结果待核对',
    description: '请检查识别内容。',
  })
  expect(wrapper.classes()).toContain('warning')
  expect(wrapper.get('h2').text()).toBe('结果待核对')
  expect(wrapper.text()).toContain('请检查识别内容。')
  expect(wrapper.text()).not.toContain('结果已保存在你的账号。')
})
