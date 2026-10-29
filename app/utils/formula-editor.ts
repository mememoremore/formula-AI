import { formulaSyntaxFeedback } from '#shared/formula-validation'

/** 与 MathFormula 使用相同安全限制；仅供编辑前反馈，不更改服务端存储契约。 */
export function formulaDraftFeedback(title: string, latex: string) {
  if (!title.trim() || title.trim().length > 100) return '请填写 1～100 字的公式名称。'
  if (!latex.trim() || latex.length > 5000) return '请填写 1～5000 字的 LaTeX。'
  return formulaSyntaxFeedback(latex)
}

export function formulaDraftChanged(
  draft: { title: string; latex: string },
  original: { title: string; latex: string },
) {
  return (
    draft.title.trim() !== original.title.trim() || draft.latex.trim() !== original.latex.trim()
  )
}
