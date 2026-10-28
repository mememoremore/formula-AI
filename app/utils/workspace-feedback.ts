/** 只展示后端已整理过的业务错误，网络与未知异常统一用友好提示。 */
export function workspaceFeedback(error: unknown, fallback = '暂时无法保存，请稍后重试。') {
  const failure = error as { statusCode?: number; data?: { message?: string } }
  if (failure?.statusCode === 401) return '登录已过期，请重新登录后再操作。'
  if (
    [400, 404, 409, 413, 429].includes(failure?.statusCode ?? 0) &&
    typeof failure.data?.message === 'string'
  )
    return failure.data.message
  return fallback
}
