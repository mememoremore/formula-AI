import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../generated/prisma/client'
import type { PrivateObjectStore } from '../storage/object-store'
import { normalizeAvatar } from '../images/avatar'
import { isAvatarKey, type ProfileUpdate } from './profile-input'
import { WorkspaceError } from './workspace-error'
/** 先准备头像，再原子替换资料；数据库失败清理新文件，旧文件仅在替换成功后清理。 */
export async function saveProfile(
  db: PrismaClient,
  store: PrivateObjectStore | null,
  ownerId: string,
  input: ProfileUpdate,
) {
  const previous = await db.user.findUniqueOrThrow({ where: { id: ownerId } })
  let nextImage = previous.image
  let uploaded: string | null = null
  if (input.avatar === null) nextImage = null
  else if (input.avatar !== undefined) {
    if (!store) throw new WorkspaceError(503, '头像存储暂时不可用。')
    uploaded = 'avatars/' + ownerId + '/' + randomUUID() + '.webp'
    await store.put(uploaded, await normalizeAvatar(input.avatar), 'image/webp')
    nextImage = uploaded
  }
  try {
    const updated = await db.user.updateMany({
      where: { id: ownerId, updatedAt: previous.updatedAt },
      data: { displayName: input.name, image: nextImage },
    })
    if (!updated.count) throw new WorkspaceError(409, '资料已在其他窗口更新，请重新读取后保存。')
  } catch (error) {
    if (uploaded && store)
      await store.remove(uploaded).catch(() => console.warn('新头像回滚清理失败。'))
    throw error
  }
  if (previous.image !== nextImage && isAvatarKey(previous.image, ownerId) && store)
    await store.remove(previous.image).catch(() => console.warn('旧头像清理失败。'))
  return { saved: true }
}
