import type { HealthResponse } from '../../shared/types/api'

export default defineEventHandler((): HealthResponse => ({
  status: 'ok',
  app: '墨析',
  recognition: 'mock',
  chat: 'mock',
  persistence: 'browser-demo',
}))
