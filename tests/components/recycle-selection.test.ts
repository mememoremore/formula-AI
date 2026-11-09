import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { computed, defineComponent, h, onMounted, onScopeDispose, ref, watch, Suspense } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import RecycleBin from '../../app/pages/recycle-bin.vue'

const transport = vi.fn(),
  wrappers: ReturnType<typeof mount>[] = []
const rows = ['a', 'b'].map((id) => ({
  id,
  title: '公式' + id,
  latex: id + '=1',
  deletedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
}))
async function page() {
  const wrapper = mount(
    defineComponent({ setup: () => () => h(Suspense, {}, { default: () => h(RecycleBin) }) }),
    {
      global: { stubs: { PageHeader: true, EmptyState: true, AppModal: true, MathFormula: true } },
    },
  )
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  for (const [name, value] of Object.entries({ computed, onMounted, onScopeDispose, ref, watch }))
    vi.stubGlobal(name, value)
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useHead', vi.fn())
  vi.stubGlobal('useAccountSession', async () => ({ data: ref({ user: { id: 'owner' } }) }))
  vi.stubGlobal('useAccountFetch', () => transport)
  vi.stubGlobal('useFormulaViewsInvalidation', () => vi.fn())
  vi.stubGlobal('useAsyncData', async (_: string, read: () => Promise<unknown>) => ({
    data: ref(await read()),
    error: ref(null),
    status: ref('success'),
    refresh: vi.fn(),
  }))
  transport
    .mockReset()
    .mockResolvedValue({ serverNow: new Date().toISOString(), items: rows, hasMore: false })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

test('全选后显示取消全选，再次点击清除选择并恢复全选', async () => {
  const wrapper = await page()
  const button = wrapper.find('.recycle-actions button')
  const checked = () =>
    wrapper
      .findAll('input[type=checkbox]')
      .map((input) => (input.element as HTMLInputElement).checked)
  expect(button.text()).toBe('全选')
  await button.trigger('click')
  expect(checked()).toEqual([true, true])
  expect(button.text()).toBe('取消全选')
  await button.trigger('click')
  expect(checked()).toEqual([false, false])
  expect(button.text()).toBe('全选')
  expect(wrapper.findAll('.recycle-actions button')[1]!.attributes('disabled')).toBeDefined()
})

test('逐条勾满也显示取消全选，部分勾选时点击全选补齐', async () => {
  const wrapper = await page()
  const inputs = wrapper.findAll('input[type=checkbox]')
  const button = wrapper.find('.recycle-actions button')
  await inputs[0]!.setValue(true)
  expect(button.text()).toBe('全选')
  await inputs[1]!.setValue(true)
  expect(button.text()).toBe('取消全选')
  await inputs[0]!.setValue(false)
  expect(button.text()).toBe('全选')
  await button.trigger('click')
  expect(button.text()).toBe('取消全选')
  expect(inputs.every((input) => (input.element as HTMLInputElement).checked)).toBe(true)
})

test('空回收站禁用全选，文字保持全选', async () => {
  transport.mockResolvedValue({ serverNow: new Date().toISOString(), items: [], hasMore: false })
  const wrapper = await page()
  const button = wrapper.find('.recycle-actions button')
  expect(button.text()).toBe('全选')
  expect(button.attributes('disabled')).toBeDefined()
})

test('回收站默认名显示公式，自定义名保持原样', async () => {
  transport.mockResolvedValue({
    serverNow: new Date().toISOString(),
    items: [
      { ...rows[0], title: '未命名公式' },
      { ...rows[1], title: '我的物理公式' },
    ],
    hasMore: false,
  })
  const wrapper = await page()
  expect(wrapper.findAll('.recycle-content strong').map((item) => item.text())).toEqual([
    '公式',
    '我的物理公式',
  ])
  expect(wrapper.find('input').attributes('aria-label')).toBe('选择公式：公式')
  expect(wrapper.text()).not.toContain('未命名公式')
})
