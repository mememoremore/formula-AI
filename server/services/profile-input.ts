import { WorkspaceError } from './workspace-error'
export interface ProfileUpdate {
  name: string
  avatar?: string | null
}
export function parseProfileUpdate(value: unknown): ProfileUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new WorkspaceError(400, '资料格式无效。')
  const data = value as Record<string, unknown>
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 100)
    throw new WorkspaceError(400, '昵称需要包含 1～100 个字符。')
  if (
    data.avatar !== undefined &&
    data.avatar !== null &&
    (typeof data.avatar !== 'string' ||
      data.avatar.length > 1_500_000 ||
      !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(data.avatar))
  )
    throw new WorkspaceError(400, '头像格式无效，请重新选择 JPEG 或 PNG 图片。')
  return {
    name: data.name.trim(),
    ...(data.avatar === undefined ? {} : { avatar: data.avatar as string | null }),
  }
}
export function isAvatarKey(value: unknown, ownerId: string): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('avatars/' + ownerId + '/') &&
    /^avatars\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/.test(value)
  )
}
export function accountAvatarUrl(value: unknown, ownerId: string) {
  return isAvatarKey(value, ownerId) ? '/api/account/avatar?v=' + value.split('/').at(-1) : null
}
