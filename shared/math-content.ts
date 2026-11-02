import katex from 'katex'

export interface ChatSegment {
  kind: 'text' | 'math' | 'code'
  content: string
  display?: boolean
  language?: string
}
const options = {
  throwOnError: true,
  trust: false,
  strict: 'ignore' as const,
  maxExpand: 200,
  maxSize: 20,
}
const command =
  /\\(?:frac|dfrac|tfrac|sqrt|sin|cos|tan|cot|sec|csc|log|ln|exp|int|iint|sum|prod|lim|pi|theta|alpha|beta|gamma|delta|epsilon|lambda|mu|sigma|phi|omega|infty|cdot|times|pm|leq|geq|neq|approx|partial|nabla|left|right|overline|vec)\b/

export function validMath(content: string) {
  if (!content.trim() || content.length > 2000) return false
  try {
    katex.renderToString(content, options)
    return true
  } catch {
    return false
  }
}
function balanced(content: string) {
  const opening: Record<string, string> = { '}': '{', ')': '(', ']': '[' }
  const stack: string[] = []
  for (const char of content) {
    if ('{(['.includes(char)) stack.push(char)
    else if ('})]'.includes(char) && stack.pop() !== opening[char]) return false
  }
  return stack.length === 0
}
/** Only complete, clearly mathematical ASCII runs are eligible; never guess prose or paths. */
function bareMath(content: string): ChatSegment[] {
  const parts: ChatSegment[] = []
  let offset = 0
  for (const match of content.matchAll(/[A-Za-z0-9\\{}()[\]^_+\-=*/.,<>|! \t]+/g)) {
    const source = match[0]
    const latex = source.trim().replace(/[.,]+$/, '')
    if (
      !command.test(latex) ||
      /[A-Za-z]{2,}/.test(latex.replace(/\\[A-Za-z]+/g, '')) ||
      !balanced(latex) ||
      !validMath(latex)
    )
      continue
    const start = match.index + source.indexOf(latex)
    if (start > offset) parts.push({ kind: 'text', content: content.slice(offset, start) })
    parts.push({ kind: 'math', content: latex, display: latex.length > 64 })
    offset = start + latex.length
  }
  if (offset < content.length) parts.push({ kind: 'text', content: content.slice(offset) })
  return parts
}
/** Code is protected first; model HTML remains text, and incomplete streaming math stays text. */
export function chatSegments(content: string): ChatSegment[] {
  const pattern =
    /```([^\n`]*)\n([\s\S]*?)(?:```|$)|`[^`\n]*`|\\\$|\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^$])+?(?<!\\)\$/g
  const parts: ChatSegment[] = []
  let offset = 0
  function appendText(value: string) {
    // Unclosed explicit delimiters are a streaming fragment, not a bare formula.
    if (/(?<!\\)\$|\\[()[\]]/.test(value)) parts.push({ kind: 'text', content: value })
    else parts.push(...bareMath(value))
  }
  for (const match of content.matchAll(pattern)) {
    if (match.index > offset) appendText(content.slice(offset, match.index))
    const value = match[0]
    if (value.startsWith('```'))
      parts.push({ kind: 'code', content: match[2] ?? '', language: (match[1] ?? '').trim() })
    else if (value.startsWith('`') || value === '\\$') parts.push({ kind: 'text', content: value })
    else {
      const display = value.startsWith('$$') || value.startsWith('\\[')
      const trim = value.startsWith('$') && !display ? 1 : 2
      const latex = value.slice(trim, -trim)
      parts.push({ kind: 'math', content: latex, display: display || latex.length > 64 })
    }
    offset = match.index + value.length
  }
  if (offset < content.length) appendText(content.slice(offset))
  const block = (part: ChatSegment | undefined) =>
    part?.kind === 'code' || (part?.kind === 'math' && part.display)
  return parts.map((part, index) => {
    if (part.kind !== 'text') return part
    let value = part.content
    if (block(parts[index - 1])) value = value.replace(/^\n+/, '')
    if (block(parts[index + 1])) value = value.replace(/\n+$/, '')
    return { ...part, content: value }
  })
}

/** Only new generated text is canonicalized. Stored historical content is never rewritten. */
export function normalizeMathText(content: string) {
  return chatSegments(content)
    .map((part) => {
      if (part.kind === 'code') return '```' + (part.language ?? '') + '\n' + part.content + '\n```'
      if (part.kind === 'text') {
        // Keep inline code literal, but reject broken math outside it in a new completed answer.
        const prose = part.content.replace(/`[^`\n]*`/g, '').replace(/\\\$/g, '')
        if (/\\[A-Za-z]+|\\[()[\]]|(?<!\\)\$(?:[A-Za-z{\\]|\$)/.test(prose))
          throw new Error('解释中的公式缺少数学标记或格式不正确，请重新生成。')
        return part.content
      }
      if (!validMath(part.content)) throw new Error('解释中的公式格式不正确，请重新生成。')
      const delimiter = part.display ? '$$' : '$'
      return delimiter + part.content + delimiter
    })
    .join('')
}
