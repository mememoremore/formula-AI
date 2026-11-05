import type { z } from 'zod'
import { WorkspaceError } from './workspace-error'

/** Expose only deliberate business messages, never raw Zod issues or the submitted input. */
export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
  fallback: string,
): z.output<Schema> {
  const result = schema.safeParse(input, { error: () => fallback })
  if (!result.success) throw new WorkspaceError(400, result.error.issues[0]?.message ?? fallback)
  return result.data
}
