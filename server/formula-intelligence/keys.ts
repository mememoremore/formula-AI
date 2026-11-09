import { createHash } from 'node:crypto'
import { formulaToText } from '../documents/formula-text'
const keys = new Map<string, string>()
/** Same exact-key policy as the miniapp; this is separate from structural similarity. */
export function exactFormulaKey(latex: string) {
  const source = latex.trim(),
    cached = keys.get(source)
  if (cached) return cached
  let normalized: string
  try {
    normalized = 'math:' + formulaToText(source).normalize('NFC').replace(/\s+/g, '')
  } catch {
    normalized = 'source:' + source.replace(/\\(?:left|right)\b/g, '').replace(/\s+/g, '')
  }
  const key = createHash('sha256').update(normalized).digest('hex')
  if (keys.size >= 3000) keys.delete(keys.keys().next().value!)
  keys.set(source, key)
  return key
}
