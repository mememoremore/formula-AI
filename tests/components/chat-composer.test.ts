import { test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
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

test('公式图片在输入区预览，文本框隐藏图片标记且仍能编辑公式与问题', async () => {
  const marker = '![公式图片](/api/account/files/11111111-1111-4111-8111-111111111111/content)'
  const wrapper = composer({ modelValue: marker + '\n$$x^2=1$$\n请解释' })
  expect(wrapper.find('.composer-images img').attributes('src')).toContain(
    '11111111-1111-4111-8111-111111111111',
  )
  expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('$$x^2=1$$\n请解释')
  await wrapper.get('textarea').setValue('$$x^2=4$$\n求解')
  expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe(marker + '\n$$x^2=4$$\n求解')
})

test('待确认或超过2000字的提问不可从回车重复提交', async () => {
  const wrapper = composer({ modelValue: 'x'.repeat(2001) })
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('send')).toBeUndefined()
  await wrapper.setProps({ modelValue: '问题', readonly: true })
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('send')).toBeUndefined()
})

test('图片准备状态通知页面并阻止发送，移除后可继续发送文字', async () => {
  const Picker = defineComponent({
    emits: ['pending'],
    setup:
      (_, { emit }) =>
      () =>
        h('div', [
          h(
            'button',
            { type: 'button', class: 'choose-image', onClick: () => emit('pending', true) },
            '选择图片',
          ),
          h(
            'button',
            { type: 'button', class: 'remove-image', onClick: () => emit('pending', false) },
            '移除图片',
          ),
        ]),
  })
  const wrapper = mount(ChatComposer, {
    props: { modelValue: '问题', ownerId: 'owner' },
    global: { stubs: { AppIcon: true, ChatFormulaImage: Picker } },
  })
  await wrapper.get('.choose-image').trigger('click')
  expect(wrapper.emitted('imagePending')?.at(-1)).toEqual([true])
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('send')).toBeUndefined()
  await wrapper.get('.remove-image').trigger('click')
  expect(wrapper.emitted('imagePending')?.at(-1)).toEqual([false])
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('send')).toHaveLength(1)
})

test('账号图片入口仅保留输入提问左边的圆形加号', () => {
  const wrapper = mount(ChatComposer, {
    props: { modelValue: '', ownerId: 'owner' },
    global: { stubs: { AppIcon: true, ChatFormulaImage: true } },
  })
  const entry = wrapper.get('.composer-entry')
  expect(entry.findAll('button')[0]!.attributes('aria-label')).toBe('插入公式图片')
  expect(entry.find('button').classes()).toContain('composer-add-image')
  expect(wrapper.text()).not.toContain('公式图片')
})
