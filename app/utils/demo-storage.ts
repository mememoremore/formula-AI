import type { DemoState } from '#shared/types/demo'

export const DEMO_STORAGE_KEY = 'formula-ai:demo:v1'
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown, max = 5000): value is string =>
  typeof value === 'string' && value.length <= max

/** Treat browser storage as untrusted. A different schema must never break page rendering. */
export function parseDemoState(raw: string): DemoState | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (
      !record(value) ||
      value.schemaVersion !== 1 ||
      !Array.isArray(value.formulas) ||
      !Array.isArray(value.categories) ||
      !record(value.chats)
    )
      return null
    if (!value.categories.every((c) => record(c) && text(c.id, 100) && text(c.name, 20)))
      return null
    if (
      !value.formulas.every(
        (f) =>
          record(f) &&
          text(f.id, 100) &&
          text(f.title, 100) &&
          text(f.latex) &&
          text(f.originalLatex) &&
          text(f.versionId, 100) &&
          typeof f.favorite === 'boolean' &&
          (f.categoryId === null || text(f.categoryId, 100)) &&
          text(f.createdAt, 50) &&
          Number.isFinite(Date.parse(f.createdAt)) &&
          text(f.updatedAt, 50) &&
          Number.isFinite(Date.parse(f.updatedAt)) &&
          (f.source === 'demo' || f.source === 'mock-recognition') &&
          (f.imageName === undefined || text(f.imageName, 255)) &&
          Array.isArray(f.versions) &&
          f.versions.length > 0 &&
          f.versions.every(
            (v) => record(v) && text(v.id, 100) && text(v.latex) && text(v.createdAt, 50),
          ),
      )
    )
      return null
    if (
      !Object.values(value.chats).every(
        (messages) =>
          Array.isArray(messages) &&
          messages.length <= 20 &&
          messages.every(
            (m) =>
              record(m) && (m.role === 'user' || m.role === 'assistant') && text(m.content, 2000),
          ),
      )
    )
      return null
    return value as unknown as DemoState
  } catch {
    return null
  }
}
