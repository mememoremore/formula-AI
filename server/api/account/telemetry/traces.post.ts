import { requireAccountWriter } from '../../../utils/auth'
import { readWorkspaceJson } from '../../../utils/request-body'
import { browserTelemetry, admitBrowserTelemetry } from '../../../diagnostics/browser-telemetry'
import { tracingEndpoint } from '../../../diagnostics/tracing'
// Deliberately outside workspaceRequest: exporting telemetry must not recursively create traces.
export default defineEventHandler(async (event) => {
  const user = await requireAccountWriter(event)
  if (!admitBrowserTelemetry(user.id))
    throw createError({ statusCode: 429, message: '诊断数据发送过于频繁。' })
  const input = await readWorkspaceJson(event)
  let value: ReturnType<typeof browserTelemetry>
  try {
    value = browserTelemetry(input)
  } catch {
    throw createError({ statusCode: 400, message: '诊断数据格式无效。' })
  }
  const endpoint = tracingEndpoint()
  if (endpoint) {
    // Bounded telemetry only; collector downtime never becomes a business error.
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
      signal: AbortSignal.timeout(1500),
    })
      .then((r) => r.body?.cancel())
      .catch(() => {})
  }
  setResponseStatus(event, 204)
  return null
})
