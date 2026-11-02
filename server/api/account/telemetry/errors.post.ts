import { requireAccountWriter } from '../../../utils/auth'
import { readWorkspaceJson } from '../../../utils/request-body'
import { admitBrowserTelemetry } from '../../../diagnostics/browser-telemetry'
import { parseBrowserErrors } from '../../../diagnostics/browser-errors'
import { diagnostic } from '../../../diagnostics/operations'
import { traced } from '../../../diagnostics/tracing'
export default defineEventHandler(async (event) => {
  const user = await requireAccountWriter(event)
  if (!admitBrowserTelemetry(user.id))
    throw createError({ statusCode: 429, message: '诊断数据发送过于频繁。' })
  let events: ReturnType<typeof parseBrowserErrors>
  try {
    events = parseBrowserErrors(await readWorkspaceJson(event))
  } catch {
    throw createError({ statusCode: 400, message: '异常摘要格式无效。' })
  }
  for (const value of events)
    await traced(
      'browser.error',
      async () => {
        diagnostic('browser.error', {
          ownerId: user.id,
          errorKind: value.errorKind,
          errorName: value.errorName,
          route: value.route,
          asset: value.asset,
          line: value.line,
          column: value.column,
          fingerprint: value.fingerprint,
          outcome: 'failed',
        })
      },
      { parent: value.traceparent, root: true },
    )
  setResponseStatus(event, 204)
  return null
})
