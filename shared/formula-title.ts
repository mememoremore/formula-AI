/** Only mask filename-like random identifiers for image-derived formulas. */
export function isRandomFormulaName(title: string) {
  return /^(?:[a-f0-9]{24,64}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(
    title.trim(),
  )
}
export function displayFormulaTitle(title: string, imageDerived: boolean) {
  return imageDerived && isRandomFormulaName(title) ? '未命名公式' : title
}

export function normalizeOptionalFormulaTitle(value: string | null | undefined) {
  const title = value?.trim() ?? ''
  return title || null
}

export function optionalFormulaTitleFeedback(value: string) {
  const title = value.trim()
  if (title.length > 100) return '公式名称不能超过 100 个字符。'
  if (/[\u0000-\u001f\u007f]/.test(title)) return '公式名称不能包含控制字符。'
  return ''
}
