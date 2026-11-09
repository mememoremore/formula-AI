import katex from 'katex'
import { formulaRenderOptions } from '#shared/formula-validation'

export class FormulaClipboardError extends Error {}

/** Keep the mathematical tree instead of flattening fractions and scripts into text. */
export function formulaClipboardContent(formulas: string[]) {
  if (
    !formulas.length ||
    formulas.length > 20 ||
    formulas.some((latex) => !latex.trim() || latex.length > 5000)
  )
    throw new Error('请选择1～20条有效公式。')

  const math = formulas.map((latex) => {
    const rendered = katex.renderToString(latex, {
      ...formulaRenderOptions,
      displayMode: true,
      output: 'mathml',
    })
    const document = new DOMParser().parseFromString(rendered, 'text/html')
    const root = document.querySelector('math')

    if (!root) throw new Error('公式暂时无法复制，请检查 LaTeX。')
    // Office imports Presentation MathML. TeX annotations can otherwise appear as duplicate text.
    root.querySelectorAll('annotation, annotation-xml').forEach((node) => node.remove())
    root.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML')
    return root.outerHTML
  })

  return {
    mathml:
      math.length === 1
        ? math[0]!
        : '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mtable columnalign="left">' +
          math
            .map(
              (value) =>
                '<mtr><mtd>' + value.replace(/^<math\b[^>]*>|<\/math>$/g, '') + '</mtd></mtr>',
            )
            .join('') +
          '</mtable></math>',
    html:
      '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' +
      math.map((value) => '<p>' + value + '</p>').join('') +
      '</body></html>',
    // A plain-text receiver cannot retain 2D layout; preserve the lossless editable source.
    text: formulas.join('\n'),
  }
}

export async function copySourceFormulas(formulas: string[]) {
  if (!navigator.clipboard?.writeText)
    throw new FormulaClipboardError('当前浏览器不支持自动复制，请使用可编辑 Word 导出。')
  // Word versions that ignore MathML inside HTML can import bare MathML text.
  // One math root is required: a table retains every selected formula as a separate row.
  await navigator.clipboard.writeText(formulaClipboardContent(formulas).mathml)
}

export async function copyEditableFormulas(formulas: string[]) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')
    throw new FormulaClipboardError(
      '当前浏览器不支持复制可编辑公式，请使用“复制 LaTeX”或导出可编辑 Word。',
    )

  const content = formulaClipboardContent(formulas)

  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([content.html], { type: 'text/html' }),
      'text/plain': new Blob([content.text], { type: 'text/plain' }),
    }),
  ])
}

/** Call write synchronously in the click gesture; conversion may finish asynchronously. */
export async function copyFormulaImage(load: () => Promise<Blob>) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')
    throw new FormulaClipboardError('当前浏览器不支持复制图片，请使用导出 Word 的图片格式。')
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': load() })])
}
