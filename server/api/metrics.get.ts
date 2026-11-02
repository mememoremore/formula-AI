import { metricsEnabled, runtimeMetrics } from '../diagnostics/metrics'
// Explicit opt-in; separate from workspaceRequest to avoid self-observation.
export default defineEventHandler(async (event) => {
  if (!metricsEnabled()) throw createError({ statusCode: 404, message: 'Not found' })
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const registry = runtimeMetrics().registry
  setResponseHeader(event, 'Content-Type', registry.contentType)
  return registry.metrics()
})
