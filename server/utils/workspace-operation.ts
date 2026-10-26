import { WorkspaceError } from '../services/workspace-error'
import { DatabaseOperationError } from '../database/errors'

/** 只输出可展示的业务错误，不泄漏 SQL、对象存储地址或凭据。 */
export async function workspaceOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof WorkspaceError)
      throw createError({ statusCode: error.statusCode, message: error.message })
    if (error instanceof DatabaseOperationError) {
      const statusCode =
        error.code === 'NOT_FOUND' ? 404 : error.code === 'VERSION_CONFLICT' ? 409 : 400
      throw createError({ statusCode, message: error.message })
    }
    if (isError(error)) throw error
    console.error('账号操作失败：', error instanceof Error ? error.name : 'UnknownError')
    throw createError({ statusCode: 500, message: '暂时无法完成操作，请稍后重试。' })
  }
}
