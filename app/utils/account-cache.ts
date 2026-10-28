/** 业务失效范围；调用方显式执行清理，并继续负责当前窗口的数据更新。 */
export function usageInvalidated(key: string) {
  return key === 'account-usage' || key.startsWith('account-usage-')
}

/** 详情由保存结果就地更新，不在这里清空它或固定版本的对话上下文。 */
export function formulaViewsInvalidated(key: string) {
  return (
    key.startsWith('account-library-') ||
    key === 'account-history' ||
    key.startsWith('account-history-') ||
    key === 'account-categories' ||
    key === 'home-recent'
  )
}

export function chatSubmissionInvalidated(key: string) {
  return (
    key === 'account-conversations' ||
    key.startsWith('account-conversations-') ||
    usageInvalidated(key) ||
    key === 'home-recent'
  )
}
