import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import BulkSelectionBar from '../../app/components/BulkSelectionBar.vue'
test('学习清单入口位于全选和删除同一操作行，原选择与删除事件继续工作', async () => {
  const wrapper = mount(BulkSelectionBar, {
    props: { count: 7, busy: false, available: 7 },
    slots: { actions: '<button>生成学习清单</button>' },
    global: { stubs: { AppIcon: true } },
  })
  const actions = wrapper.find('.bulk-actions')
  expect(actions.findAll('button').map((button) => button.text())).toEqual([
    '全选',
    '生成学习清单',
    '删除',
  ])
  await actions.findAll('button')[0]!.trigger('click')
  await actions.findAll('button')[2]!.trigger('click')
  expect(wrapper.emitted('selectAll')).toHaveLength(1)
  expect(wrapper.emitted('remove')).toHaveLength(1)
})
