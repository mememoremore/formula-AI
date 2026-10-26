export function authenticationError(code?: string, status?: number) {
  if (status === 429) return '操作有些频繁，请稍后再试。'
  if (status === 503) return '账号服务暂时不可用，请稍后重试。'
  switch (code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return '邮箱或密码不正确，请重新输入。'
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return '这个邮箱已注册，可以直接登录。'
    case 'PASSWORD_TOO_SHORT':
      return '密码至少需要 10 个字符。'
    case 'PASSWORD_TOO_LONG':
      return '密码不能超过 128 个字符。'
    case 'INVALID_EMAIL':
      return '请输入有效的邮箱地址。'
    default:
      return '暂时无法完成操作，请检查输入或稍后重试。'
  }
}

export { safeReturnPath as accountRedirect } from '#shared/navigation'
