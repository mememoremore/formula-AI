import katex from 'katex'
export const formulaRenderOptions = {
  throwOnError: true,
  trust: false,
  strict: 'warn' as const,
  maxExpand: 200,
  maxSize: 20,
}
/** Return a bounded, user-readable parser reason; never expose a stack or raw HTML. */
export function formulaSyntaxFeedback(latex: string) {
  try {
    katex.renderToString(latex, { ...formulaRenderOptions, displayMode: true })
    return ''
  } catch (cause) {
    const detail =
      cause instanceof Error
        ? cause.message
            .replace(/^KaTeX parse error:\s*/, '')
            .replace(/[\u0000-\u001f]/g, ' ')
            .slice(0, 180)
        : '请检查括号、命令和环境。'
    return `LaTeX 暂时无法预览：${detail}`
  }
}
export function manualFormulaFeedback(title: string, latex: string) {
  if (!title.trim() || title.trim().length > 100 || /[\u0000-\u001f\u007f]/.test(title))
    return '公式名称需要包含 1～100 个字符，不能含控制字符。'
  if (!latex.trim() || latex.trim().length > 5000) return 'LaTeX 需要包含 1～5000 个字符。'
  if (
    latex.includes('\0') ||
    latex.includes('```') ||
    /\\(?:documentclass|begin\s*\{document\}|input|include|write|openout|read|catcode|href|url|includegraphics|htmlClass|htmlId|htmlStyle|htmlData)\b/.test(
      latex,
    )
  )
    return '请只输入数学公式，不支持文档、外部资源或 HTML 扩展命令。'
  return formulaSyntaxFeedback(latex.trim())
}
