/** Better Auth 的默认入口只允许昵称更新；头像必须经过 Profile Service。 */
export function authProfileViolation(path: string, body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const value = body as Record<string, unknown>
  if (
    path === '/update-user' &&
    value.name !== undefined &&
    (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 100)
  )
    return '昵称需要包含 1～100 个字符。'
  if (path === '/update-user' && Object.keys(value).some((key) => key !== 'name'))
    return '此入口只允许修改昵称。头像请在编辑资料中上传或重置，其他账号字段不可修改。'
  if (path === '/sign-up/email' && ('image' in value || 'avatar' in value))
    return '注册时不能指定头像引用，请登录后在编辑资料中上传。'
  return null
}
