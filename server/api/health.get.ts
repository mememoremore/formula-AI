import type { HealthResponse } from '../../shared/types/api'

export default defineEventHandler((): HealthResponse => ({
  status: 'ok',
  app: 'Formula AI',
  recognition: 'mock',
  chat: 'mock',
  persistence: 'browser-demo',
}))
