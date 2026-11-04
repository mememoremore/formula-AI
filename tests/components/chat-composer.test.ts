import { test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatComposer from '../../app/components/ChatComposer.vue'

function composer(
  props: Partial<{ modelValue: string; busy: boolean; disabled: boolean; stopping: boolean }> = {},
) {
  return mount(ChatComposer, {
    props: { modelValue: '', ...props },
    global: { stubs: { AppIcon: true } },
  })
}

test('empty and whitespace-only questions cannot be submitted', async () => {
  const wrapper = composer()
  expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('send')).toBeUndefined()
  await wrapper.setProps({ modelValue: '   ' })
  await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
  expect(wrapper.emitted('send')).toBeUndefined()
})

test('typing updates v-model and submitting a valid draft emits once', async () => {
  const wrapper = composer()
  await wrapper.get('textarea').setValue('解释这个公式')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['解释这个公式'])
  await wrapper.setProps({ modelValue: '解释这个公式' })
  expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('send')).toHaveLength(1)
})

test('Enter sends, Shift+Enter preserves a newline, IME composition never sends prematurely', async () => {
  const wrapper = composer({ modelValue: '问题' })
  const input = wrapper.get('textarea')
  await input.trigger('keydown', { key: 'Enter', shiftKey: true })
  await input.trigger('keydown', { key: 'Enter', isComposing: true })
  await input.trigger('keydown', { key: 'Enter', keyCode: 229 })
  await input.trigger('compositionstart')
  await input.trigger('keydown', { key: 'Enter' })
  expect(wrapper.emitted('send')).toBeUndefined()
  await input.trigger('compositionend')
  await input.trigger('keydown', { key: 'Enter' })
  expect(wrapper.emitted('send')).toHaveLength(1)
})

test('a disabled composer refuses form submission and Enter even with a draft', async () => {
  const wrapper = composer({ modelValue: '问题', disabled: true })
  expect(wrapper.get('textarea').attributes('disabled')).toBeDefined()
  await wrapper.get('form').trigger('submit')
  await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
  expect(wrapper.emitted('send')).toBeUndefined()
})

test('generation exposes stop instead of send; pending stop cannot be clicked twice', async () => {
  const wrapper = composer({ modelValue: '问题', busy: true })
  expect(wrapper.find('[aria-label="发送提问"]').exists()).toBe(false)
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('send')).toBeUndefined()
  await wrapper.get('[aria-label="停止生成"]').trigger('click')
  expect(wrapper.emitted('stop')).toHaveLength(1)
  await wrapper.setProps({ stopping: true })
  const stop = wrapper.get('[aria-label="正在停止生成"]')
  expect(stop.attributes('disabled')).toBeDefined()
  await stop.trigger('click')
  expect(wrapper.emitted('stop')).toHaveLength(1)
})

test('unmount releases keyboard layout variables owned by the composer', () => {
  const wrapper = composer()
  document.documentElement.style.setProperty('--chat-keyboard-offset', '123px')
  document.documentElement.style.setProperty('--chat-composer-height', '80px')
  wrapper.unmount()
  expect(document.documentElement.style.getPropertyValue('--chat-keyboard-offset')).toBe('')
  expect(document.documentElement.style.getPropertyValue('--chat-composer-height')).toBe('')
})
