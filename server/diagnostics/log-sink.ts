import { appendFileSync, mkdirSync, statSync, renameSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
/** Only the sanitized diagnostic object reaches this sink; bounded local retention. */
export function writeDiagnosticFile(service: string, line: string) {
  if (!process.env.FORMULA_LOG_DIR) return
  try {
    const directory = resolve(process.env.FORMULA_LOG_DIR)
    mkdirSync(directory, { recursive: true })
    const file = join(directory, service + '.jsonl')
    if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > 5 * 1024 * 1024) {
      rmSync(file + '.2', { force: true })
      if (statSync(file + '.1', { throwIfNoEntry: false })) renameSync(file + '.1', file + '.2')
      renameSync(file, file + '.1')
    }
    appendFileSync(file, line + '\n', { mode: 0o600 })
  } catch {
    /* Telemetry failures never change business results. */
  }
}
