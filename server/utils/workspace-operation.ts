import { WorkspaceError } from '../services/workspace-error'
import { DatabaseOperationError } from '../database/errors'
import { ResourceLimitError } from '../resources/policy'
import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { diagnostic, safeDiagnosticCode, withDiagnostics } from '../diagnostics/operations'

/** HTTP上下文与事务规则分开；成功GET/SSE不产生日志，避免轮询放大。 */
export function workspaceRequest<T>(event: H3Event, operation: () => Promise<T>): Promise<T> {
  const requestId = randomUUID()
  setResponseHeader(event, 'X-Request-Id', requestId)
  const path = event.path.split('?')[0] ?? ''
  const kind = path.includes('/conversations')
    ? 'chat'
    : path.includes('/recognitions')
      ? 'recognition'
      : path.includes('/exports')
        ? 'export'
        : path.includes('/files')
          ? 'upload'
          : path.includes('/profile')
            ? 'profile'
            : 'account'
  return withDiagnostics(
    { requestId, operation: kind },
    async () => {
      const start = performance.now()
      let observedCode: string | undefined
      try {
        const result = await workspaceOperation(operation, (error) => {
          observedCode = safeDiagnosticCode(error)
        })
        if (!['GET', 'HEAD'].includes(event.method) || path.endsWith('/download')) {
          const row =
            result && typeof result === 'object' ? (result as Record<string, unknown>) : {}
          const file =
            row.file && typeof row.file === 'object' ? (row.file as Record<string, unknown>) : {}
          diagnostic('http.operation', {
            stage: 'request',
            outcome: 'returned',
            durationMs: Math.round(performance.now() - start),
            status: getResponseStatus(event),
            resourceId: typeof row.id === 'string' ? row.id : getRouterParam(event, 'id'),
            taskId: typeof row.id === 'string' && 'attemptCount' in row ? row.id : undefined,
            fileId:
              typeof row.fileId === 'string'
                ? row.fileId
                : typeof file.id === 'string'
                  ? file.id
                  : undefined,
          })
        }
        return result
      } catch (error) {
        diagnostic('http.operation', {
          stage: 'request',
          outcome: 'failed',
          resourceId: getRouterParam(event, 'id'),
          code: observedCode ?? safeDiagnosticCode(error),
          durationMs: Math.round(performance.now() - start),
        })
        throw error
      }
    },
    { inheritContext: false },
  )
}

/** 只输出可展示的业务错误，不泄漏 SQL、对象存储地址或凭据。 */
export async function workspaceOperation<T>(
  operation: () => Promise<T>,
  observeError?: (error: unknown) => void,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    observeError?.(error)
    if (error instanceof ResourceLimitError)
      throw createError({
        statusCode: error.statusCode,
        message: error.message,
        data: { code: error.code },
      })
    if (error instanceof WorkspaceError)
      throw createError({ statusCode: error.statusCode, message: error.message })
    if (error instanceof DatabaseOperationError) {
      const statusCode =
        error.code === 'NOT_FOUND' ? 404 : error.code === 'VERSION_CONFLICT' ? 409 : 400
      throw createError({ statusCode, message: error.message })
    }
    if (isError(error)) throw error
    if (!observeError)
      diagnostic('http.operation', { outcome: 'unconfirmed', code: safeDiagnosticCode(error) })
    throw createError({ statusCode: 500, message: '暂时无法完成操作，请稍后重试。' })
  }
}
