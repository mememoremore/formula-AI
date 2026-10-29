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
  return { counts, failures, files, codes, unpublishedFailureNames: failed.size - failures.length }
}
