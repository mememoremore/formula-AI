import { test, expect } from 'vitest'
import { sameTemplate } from '../server/formula-intelligence/template.cjs'
import { exactFormulaKey } from '../server/formula-intelligence/keys'
import {
  aiVerdictSchema,
  repairInputSchema,
  repairOutputSchema,
} from '../shared/schemas/formula-intelligence'
import { rankSimilarity } from '../server/database/formula-duplicates'
test('精确公式键与小程序一致，忽略空格与数学显示定界差异', () => {
  expect(exactFormulaKey('x=1')).toBe(exactFormulaKey(' $ x = 1 $ '))
  expect(exactFormulaKey('\\left(x+1\\right)^2')).toBe(exactFormulaKey('(x+1)^2'))
  expect(exactFormulaKey('x^2')).not.toBe(exactFormulaKey('x'))
})
test('移植小程序的一致改名、整体代入及保守反例', () => {
  for (const [a, b] of [
    ['\\sin^2 x+\\cos^2 x=1', '\\sin^2 t+\\cos^2 t=1'],
    ['x^2+x=0', '(t+1)^2+(t+1)=0'],
  ])
    expect(sameTemplate(a, b)).toBe(true)
  for (const [a, b] of [
    ['F=ma', 'E=mc'],
    ['\\sin^2 x+\\cos^2 x=1', 'a^2-b^2=(a-b)(a+b)'],
    ['x^2+x=0', 'y^2+z=0'],
  ])
    expect(sameTemplate(a, b)).toBe(false)
})
test('候选只做有限筛选，不将分式骨架当成同式', () => {
  expect(rankSimilarity('F=m/a', [{ latex: 'E=m/c' }])).toEqual([])
  expect(
    rankSimilarity(
      '\\sin x=0',
      Array.from({ length: 20 }, (_, id) => ({ id, latex: '\\sin t=0' })),
    ),
  ).toHaveLength(12)
})
test('领域与模型输出严格验证', () => {
  expect(repairInputSchema.safeParse({ requestKey: 'bad', domain: '数学' }).success).toBe(false)
  expect(repairOutputSchema.safeParse({ status: 'anything', reason: 'a' }).success).toBe(false)
  expect(aiVerdictSchema.safeParse({ decision: 'same', confidence: 1 }).success).toBe(false)
})
