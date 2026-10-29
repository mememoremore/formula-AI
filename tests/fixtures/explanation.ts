import type { FormulaExplanation } from '../../shared/explanation'
export const explanationFixture: FormulaExplanation = {
  schemaVersion: 1,
  summary: '先理解公式的结构，再核对适用条件。',
  symbols: [{ latex: 'x', meaning: '待求的未知数' }],
  conditions: ['在给定数域中讨论。'],
  steps: [{ title: '观察结构', text: '识别运算顺序和等式关系。', latex: 'x^2-5x+6=0' }],
  examples: ['可以用因式分解法核对解。'],
  warnings: ['这是一份受控测试解释，不是数学正确性证明。'],
}
