import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Card from '../../app/components/FormulaListCard.vue'
const navigate = vi.fn()
function card() {
  return mount(Card, {
    props: {
      title: '公式',
      latex: 'x=2',
      to: '/formulas/1',
      favorite: false,
      createdAt: '2026-11-09T00:00:00Z',
      editableCategory: true,
    },
    global: {
      stubs: {
        NuxtLink: { template: '<a><slot/></a>' },
        MathFormula: { template: '<div class="math">x=2</div>' },
        AppIcon: true,
        FavoriteButton: {
          emits: ['toggle'],
          template: '<button class="heart" @click="$emit(\'toggle\')">爱心</button>',
        },
      },
    },
  })
}
beforeEach(() => vi.stubGlobal('navigateTo', navigate.mockReset()))
afterEach(() => vi.unstubAllGlobals())
test('空白、公式和日期均可进入详情，真实标题链接仍保留', async () => {
  const w = card()
  for (const selector of ['article', '.math', '.formula-card-heading']) {
    await w.get(selector).trigger('click')
    expect(navigate).toHaveBeenLastCalledWith('/formulas/1')
  }
  expect(w.find('a').exists()).toBe(true)
})
test('分类、爱心及其子元素只触发独立操作，不进入详情', async () => {
  const w = card()
  await w.get('.category-badge').trigger('click')
  await w.get('.heart').trigger('click')
  expect(w.emitted('category')).toHaveLength(1)
  expect(w.emitted('favorite')).toHaveLength(1)
  expect(navigate).not.toHaveBeenCalled()
})
test('横向滑动不误跳详情，公式可通过Enter进入详情', async () => {
  const w = card()
  await w.get('article').trigger('pointerdown', { clientX: 10, clientY: 10 })
  await w.get('.math').trigger('click', { clientX: 70, clientY: 10 })
  expect(navigate).not.toHaveBeenCalled()
  await w.get('.math').trigger('keydown', { key: 'Enter' })
  expect(navigate).toHaveBeenCalledWith('/formulas/1')
})
