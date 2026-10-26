import type { Category, Formula } from '../types/api'

export const demoCategories: Category[] = [
  { id: 'calculus', name: '高等数学' },
  { id: 'algebra', name: '线性代数' },
  { id: 'probability', name: '概率论' },
  { id: 'physics', name: '大学物理' },
]

const samples = [
  {
    id: 'integral',
    title: '定积分',
    latex: '\\int_0^1 x^2\\,dx = \\frac{1}{3}',
    categoryId: 'calculus',
    favorite: false,
  },
  {
    id: 'quadratic',
    title: '一元二次方程求根公式',
    latex: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
    categoryId: 'algebra',
    favorite: false,
  },
  { id: 'energy', title: '质能方程', latex: 'E = mc^2', categoryId: 'physics', favorite: true },
]

export const demoFormulas: Formula[] = samples.map((item, index) => {
  const createdAt = `2026-10-${20 - index}T08:00:00.000Z`
  return {
    ...item,
    originalLatex: item.latex,
    versionId: `${item.id}-v1`,
    versions: [{ id: `${item.id}-v1`, latex: item.latex, createdAt }],
    createdAt,
    updatedAt: createdAt,
    source: 'demo',
  }
})
