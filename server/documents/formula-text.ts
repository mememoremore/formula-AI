import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import { STATE } from 'mathjax-full/js/core/MathItem.js'
import 'mathjax-full/js/input/tex/AllPackages.js'
import { normalizeLatex } from './formula-renderer'
RegisterHTMLHandler(liteAdaptor())
const document = mathjax.document('', {
  InputJax: new TeX({
    packages: ['base', 'ams', 'boldsymbol', 'newcommand', 'mathtools'],
    maxMacros: 1000,
    maxBuffer: 10000,
  }),
})
interface MathNode {
  kind: string
  childNodes: MathNode[]
  isToken: boolean
  getText(): string
  attributes: { get(name: string): unknown }
}
const superMap = Object.fromEntries(
  Array.from('0123456789+-−=()ni').map((char, index) => [
    char,
    Array.from('⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿⁱ')[index],
  ]),
)
const subMap = Object.fromEntries(
  Array.from('0123456789+-−=()aeioruvx').map((char, index) => [
    char,
    Array.from('₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎ₐₑᵢₒᵣᵤᵥₓ')[index],
  ]),
)

function script(value: string, map: Record<string, string | undefined>, fallback: string) {
  const compact = value.trim().replace(/\s+/g, '')
  return compact && Array.from(compact).every((char) => map[char])
    ? Array.from(compact)
        .map((char) => map[char])
        .join('')
    : `${fallback}(${value.trim()})`
}
function grouped(value: string) {
  return /^(?:[\p{L}\p{N}]|\d+(?:\.\d+)?)$/u.test(value.trim()) ? value.trim() : `(${value.trim()})`
}
function scriptBase(node: MathNode | undefined, value: string) {
  // Braces can group a multi-term base without visible parentheses in the tree.
  while (
    node &&
    ['TeXAtom', 'mrow', 'inferredMrow'].includes(node.kind) &&
    node.childNodes.length === 1
  )
    node = node.childNodes[0]
  const text = value.trimEnd()
  return node &&
    ['mrow', 'inferredMrow'].includes(node.kind) &&
    node.childNodes.length > 1 &&
    !/^[([{].*[)\]}]$/s.test(text)
    ? `(${text})`
    : text
}
function textNode(node: MathNode | undefined, search = false): string {
  if (!node) return ''
  if (node.kind === 'merror')
    throw Object.assign(new Error('公式语法有误，请先编辑公式再复制'), {
      status: 422,
      code: 'INVALID_FORMULA',
    })
  if (['annotation', 'annotation-xml'].includes(node.kind)) return ''
  if (node.kind === 'mspace') return ' '
  if (node.isToken || node.kind === 'text') {
    const text = node
      .getText()
      .replace(/[\u2061\u2062\u2063\u2064]/g, ' ')
      .replace(/[\u200b-\u200d]/g, '')
    if (node.kind === 'mi' && text.length > 1) return `${text} `
    return node.kind === 'mo' && /^[+−\-=±×÷<>≤≥≈≠→↔∈∉∝]$/.test(text) ? ` ${text} ` : text
  }
  const children = node.childNodes || []
  const values = children.map((child) => textNode(child, search))
  const base = values[0] || ''
  if (node.kind === 'mfrac') {
    if (/^0(?:px|em|pt)?$/.test(String(node.attributes.get('linethickness'))))
      return search ? `${base} ${values[1] || ''}` : `C(${base.trim()}, ${values[1]?.trim()})`
    return `(${grouped(base)}/${grouped(values[1] || '')})`
  }
  if (node.kind === 'msqrt') return `√(${values.join('').trim()})`
  if (node.kind === 'mroot')
    return search
      ? `${values[1]}√(${base.trim()})`
      : `${values[1] === '3' ? '∛' : values[1] === '4' ? '∜' : `root[${values[1]}]`}(${base.trim()})`
  if (node.kind === 'msup')
    return (
      scriptBase(children[0], base) +
      script(values[1] ?? '', superMap, '^') +
      (/\s$/.test(base) ? ' ' : '')
    )
  if (node.kind === 'msub')
    return (
      scriptBase(children[0], base) +
      script(values[1] ?? '', subMap, '_') +
      (/\s$/.test(base) ? ' ' : '')
    )
  if (node.kind === 'msubsup')
    return (
      scriptBase(children[0], base) +
      script(values[1] ?? '', subMap, '_') +
      script(values[2] ?? '', superMap, '^') +
      (/\s$/.test(base) ? ' ' : '')
    )
  if (node.kind === 'munder') return base + script(values[1] ?? '', subMap, '_')
  if (node.kind === 'mover')
    return search
      ? `${base}${values[1] || ''}`
      : values[1]?.trim() === '→'
        ? `${base}⃗`
        : `over(${base.trim()}; ${values[1]?.trim()})`
  if (node.kind === 'munderover')
    return base + script(values[1] ?? '', subMap, '_') + script(values[2] ?? '', superMap, '^')
  if (node.kind === 'mtable') return values.join('\n')
  if (node.kind === 'mtr' || node.kind === 'mlabeledtr') return values.join('   ')
  return values.join('')
}

function convertMathText(value: string, search: boolean) {
  const latex = normalizeLatex(value)
  try {
    const root = document.convert(latex, { display: true, end: STATE.COMPILED })
    const text = textNode(root as unknown as MathNode, search)
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .trim()
    if (!text) throw new Error('公式为空，无法复制')
    return text
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'INVALID_FORMULA') throw error
    throw Object.assign(new Error('公式暂时无法转换，请先编辑公式再复制'), {
      status: 422,
      code: 'INVALID_FORMULA',
    })
  } finally {
    document.clear()
    document.inputJax[0]!.reset()
  }
}
export const formulaToText = (value: string) => convertMathText(value, false)
