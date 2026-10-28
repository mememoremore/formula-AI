import { requireAccountWriter } from '../../utils/auth'
import { getDatabase } from '../../utils/database'
import { getObjectStore } from '../../utils/storage'
import { readLimitedBody } from '../../utils/request-body'
import { workspaceOperation } from '../../utils/workspace-operation'
import { parseProfileUpdate } from '../../services/profile-input'
import { saveProfile } from '../../services/profile'
import { randomUUID } from 'node:crypto'
import { reserveResource, releaseUnbound } from '../../resources/leases'
export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountWriter(event)
    if (getHeader(event, 'content-type')?.split(';')[0] !== 'application/json')
      throw createError({ statusCode: 415, message: '请使用 JSON 提交资料。' })
    const db = getDatabase()
    // 先占处理槽位保护正文缓冲；读取后仅真正的新头像才计频率和持久容量。
    const lease = await reserveResource(db, {
      ownerId: user.id,
      purpose: 'AVATAR_UPLOAD',
      requestKey: randomUUID(),
      bytes: 0,
      countsTowardRate: false,
    })
    try {
      const raw = await readLimitedBody(event, 1_600_000)
      let value: unknown
      try {
        value = JSON.parse(raw.toString('utf8'))
      } catch {
        throw createError({ statusCode: 400, message: '资料不是有效的 JSON。' })
      }
      const input = parseProfileUpdate(value)
      // 单独修改昵称不依赖对象存储；修改或重置头像时才访问存储。
      return await saveProfile(
        db,
        input.avatar === undefined ? null : getObjectStore(),
        user.id,
        input,
        lease,
      )
    } finally {
      await releaseUnbound(db, lease).catch(() => {})
    }
  }),
)
