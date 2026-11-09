import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ref, watch } from 'vue'
import { mount } from '@vue/test-utils'
import FormulaDetailContent from '../../app/components/FormulaDetailContent.vue'
import FormulaListCard from '../../app/components/FormulaListCard.vue'

beforeEach(() => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('watch', watch)
})
afterEach(() => vi.unstubAllGlobals())

test.each([
  ['未命名公式', '公式'],
  ['我的三角函数', '我的三角函数'],
  ['未命名公式的笔记', '未命名公式的笔记'],
])('详情和列表显示名称：%s', (title, expected) => {
  const detail = mount(FormulaDetailContent, {
    props: { title, latex: 'a=b', manual: true },
    global: { stubs: { MathFormula: true, AppIcon: true, FormulaCopyAction: true } },
  })
  const card = mount(FormulaListCard, {
    props: {
      title,
      latex: 'a=b',
      to: '/formulas/1',
      favorite: false,
      createdAt: '2026-11-09T00:00:00Z',
    },
    global: {
      stubs: { NuxtLink: { template: '<a><slot /></a>' }, FavoriteButton: true, MathFormula: true },
    },
  })
  expect(detail.find('h2').text()).toBe(expected)
  expect(card.find('h3').text()).toBe(expected)
  expect(card.find('a').attributes('aria-label')).toBe('查看' + expected)
  detail.unmount()
  card.unmount()
})
