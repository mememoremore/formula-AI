import { profileInputSchema, type ProfileUpdate } from '../../shared/schemas/profile-input'
import { parseInput } from './parse-input'
export type { ProfileUpdate } from '../../shared/schemas/profile-input'
export function parseProfileUpdate(value: unknown): ProfileUpdate {
  return parseInput(profileInputSchema, value, '资料格式无效。')
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
