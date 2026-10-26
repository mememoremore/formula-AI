import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'

export function sourceFingerprint() {
  const hash = createHash('sha256')
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = resolve(directory, entry.name)
      if (file === resolve('server/generated')) continue
      if (entry.isDirectory()) walk(file)
      else {
        hash.update(relative(process.cwd(), file).replaceAll('\\', '/'))
        hash.update(readFileSync(file))
      }
    }
  }
  for (const directory of ['app', 'server', 'shared', 'prisma', 'public', 'tests/build'])
    walk(directory)
  for (const file of ['nuxt.config.ts', 'package.json', 'package-lock.json']) {
    hash.update(file)
    hash.update(readFileSync(file))
  }
  return hash.digest('hex')
}

export function publicBuildFiles(directory: string): { path: string; sha256: string }[] {
  const output: { path: string; sha256: string }[] = []
  function walk(current: string) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = resolve(current, entry.name)
      if (entry.isDirectory()) walk(file)
      else
        output.push({
          path: relative(directory, file).replaceAll('\\', '/'),
          sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
        })
    }
  }
  walk(directory)
  return output
}
