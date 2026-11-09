import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import 'mathjax-full/js/input/tex/AllPackages.js'
import sharp from 'sharp'

export function normalizeLatex(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 5000)
    throw new Error('公式不能为空，且不能超过5000字符。')
  let latex = value.trim()
  if (latex.startsWith('$$') && latex.endsWith('$$')) latex = latex.slice(2, -2)
  else if (latex.startsWith('$') && latex.endsWith('$')) latex = latex.slice(1, -1)
  else if (/^\\[([]/.test(latex) && /\\[)\]]$/.test(latex)) latex = latex.slice(2, -2)
  if (!latex.trim() || /\\(?:href|url|includegraphics|require|html\w*|unicode)\b/i.test(latex))
    throw new Error('公式包含不支持的命令。')
  return latex
}
const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)
const mathDocument = mathjax.document('', {
  InputJax: new TeX({
    packages: ['base', 'ams', 'boldsymbol', 'newcommand', 'mathtools'],
    maxMacros: 1000,
    maxBuffer: 10000,
  }),
  OutputJax: new SVG({ fontCache: 'none' }),
})
export async function formulaPng(value: string): Promise<{ data: Buffer; width: number }> {
  let svg: string, width: number
  try {
    const node = mathDocument.convert(normalizeLatex(value), {
      display: true,
      em: 24,
      ex: 12,
      containerWidth: 1200,
    })
    if (adaptor.outerHTML(node).includes('data-mml-node="merror"'))
      throw new Error('公式语法有误，请编辑后重试。')
    const root = adaptor.tags(node, 'svg')[0]!
    const [x, y, w, h] = (adaptor.getAttribute(root, 'viewBox') ?? '').split(/\s+/).map(Number) as [
      number,
      number,
      number,
      number,
    ]
    width = Math.ceil(((w + 240) * 24) / 1000)
    const height = Math.ceil(((h + 240) * 24) / 1000)
    if (
      ![width, height].every(Number.isFinite) ||
      width < 1 ||
      height < 1 ||
      width > 4000 ||
      height > 1500 ||
      width * height > 2000000
    )
      throw new Error('公式过长，请拆分后导出。')
    adaptor.setAttribute(root, 'viewBox', `${x - 120} ${y - 120} ${w + 240} ${h + 240}`)
    adaptor.setAttribute(root, 'width', String(width * 2))
    adaptor.setAttribute(root, 'height', String(height * 2))
    adaptor.setAttribute(root, 'color', '#000000')
    svg = adaptor.outerHTML(root)
  } finally {
    mathDocument.clear()
    mathDocument.inputJax[0]!.reset()
  }
  return {
    data: await sharp(Buffer.from(svg)).flatten({ background: '#ffffff' }).png().toBuffer(),
    width,
  }
}
