import { demoCategories, demoFormulas } from '#shared/demo/formulas'
import type { DemoState } from '#shared/types/demo'

export function createDemoState(): DemoState {
  return {
    schemaVersion: 1,
    formulas: structuredClone(demoFormulas),
    categories: structuredClone(demoCategories),
    chats: {},
  }
}

export function useDemoStore() {
  return useState<DemoState>('demo-store', createDemoState)
}
