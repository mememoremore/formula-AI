/** 本轮只统一账号边界的已有键，不改变各业务自己的刷新策略。 */
export function privateAccountKey(key: string) {
  return (
    key !== 'account-session' &&
    (key.startsWith('account-') ||
      key.startsWith('saved-formula-') ||
      key.startsWith('draft-') ||
      key.startsWith('chat-formula-picker') ||
      key === 'home-recent')
  )
}
