/** Never publish assertions, errors, stacks, HTTP bodies, environment values or raw log lines. */
export function safeTestDiagnostics(log: string, sources: Record<string, string>) {
  const clean = log.replace(/\u001b\[[0-9;]*m/g, '')
  const titles = new Map<string, string>()
  for (const [file, source] of Object.entries(sources)) {
    if (!/^tests\/[\w./-]+\.(?:ts|mjs)$/.test(file) || file.includes('..')) continue
    for (const match of source.matchAll(/\btest(?:\.skip|\.todo)?\(\s*(['"])([^'"\r\n]+)\1/g))
      titles.set(match[2]!, file)
  }
  const counts: Record<string, number> = {}
  for (const match of clean.matchAll(
    /^\s*(?:ℹ|#)\s*(tests|pass|fail|cancelled|skipped)\s+(\d+)\s*$/gm,
  ))
    counts[match[1]!] = Number(match[2])
  const failed = new Set<string>()
  for (const line of clean.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:✖\s+|not ok \d+ - )(.+?)(?:\s+\([\d.]+ms\))?$/)
    if (match) failed.add(match[1]!)
  }
  const failures = [...failed]
    .filter((name) => titles.has(name))
    .map((name) => ({ name, file: titles.get(name)! }))
  const files = Object.keys(sources).filter(
    (file) =>
      /^tests\/[\w./-]+\.(?:ts|mjs)$/.test(file) &&
      !file.includes('..') &&
      (clean.includes(file) || clean.includes(file.replaceAll('/', '\\'))),
  )
  const codes = [
    'ERR_ASSERTION',
    'ERR_TEST_FAILURE',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOENT',
    'EACCES',
    'EPERM',
  ].filter((code) => new RegExp(`\\b${code}\\b`).test(clean))
  const numericAssertions = [...clean.matchAll(/^\s*(actual|expected): (\d{1,6})[,\s]*$/gm)].map(
    (match) => ({ field: match[1]!, value: Number(match[2]) }),
  )
  return {
    counts,
    failures,
    files,
    codes,
    numericAssertions,
    unpublishedFailureNames: failed.size - failures.length,
  }
}

export function safeRuntimeSignals(log: string) {
  const rules = {
    TEST_NETWORK_DENIED: '测试网络策略拒绝非受控连接',
    MODULE_MISSING: 'Cannot find module',
    PACKAGE_MISSING: 'Cannot find package',
    VITE_LOAD_FAILED: 'Failed to load url',
    PANDOC_MISSING: 'Word 转换工具未配置',
    PANDOC_CONVERSION_REJECTED: '这个 LaTeX 暂时无法完整转换',
  }
  return Object.entries(rules)
    .filter(([, marker]) => log.includes(marker))
    .map(([code]) => code)
}

/** Only used for an anonymous /about error before any test account/data exists. */
export function publicFixtureErrorTemplate(message: string, secrets: string[]) {
  let result = message.split(/[\r\n]/)[0] ?? ''
  for (const secret of secrets
    .filter((value) => value.length >= 8)
    .sort((a, b) => b.length - a.length))
    result = result
      .replaceAll(secret, '<config>')
      .replaceAll(encodeURIComponent(secret), '<config>')
  return result
    .replace(/https?:\/\/[^\s]+/g, '<url>')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>')
    .replace(/(['"`])[^'"`]*\1/g, '<quoted>')
    .replace(/(?:[A-Z]:\\|\/)[^\s),:]*/gi, '<path>')
    .replace(/[A-Za-z0-9_-]{24,}/g, '<opaque>')
    .slice(0, 500)
}
