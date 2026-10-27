export interface ChatSegment {
  kind: 'text' | 'math' | 'code'
  content: string
  display?: boolean
  language?: string
}
/** 代码先于数学解析；所有非数学内容仍是 Vue 文本节点，不运行模型 HTML。 */
export function chatSegments(content: string): ChatSegment[] {
  const pattern =
    /```([^\n`]*)\n([\s\S]*?)(?:```|$)|\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^$])+?(?<!\\)\$/g
  const parts: ChatSegment[] = []
  let offset = 0
  for (const match of content.matchAll(pattern)) {
    if (match.index > offset)
      parts.push({ kind: 'text', content: content.slice(offset, match.index) })
    const value = match[0]
    if (value.startsWith('```'))
      parts.push({ kind: 'code', content: match[2] ?? '', language: (match[1] ?? '').trim() })
    else {
      const display = value.startsWith('$$') || value.startsWith('\\['),
        trim = value.startsWith('$') && !display ? 1 : 2
      parts.push({ kind: 'math', content: value.slice(trim, -trim), display })
    }
    offset = match.index + value.length
  }
  if (offset < content.length) parts.push({ kind: 'text', content: content.slice(offset) })
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
