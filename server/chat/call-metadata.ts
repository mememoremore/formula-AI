import type { ChatUsage } from './adapter'
/** 只接受供应商原始usage中的非负整数；缺省值不推算、不填0。 */
export function providerUsage(value: unknown): ChatUsage | undefined {
  if (!value || typeof value !== 'object') return
  const raw = value as Record<string, unknown>
  const result: ChatUsage = {}
  for (const [source, target] of [
    ['prompt_tokens', 'inputTokens'],
    ['completion_tokens', 'outputTokens'],
    ['total_tokens', 'totalTokens'],
  ] as const) {
    const count = raw[source]
    if (count === undefined || count === null) continue
    if (
      typeof count !== 'number' ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > 2147483647
    )
      return
    result[target] = count
  }
  return Object.keys(result).length ? result : undefined
}
