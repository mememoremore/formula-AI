import { requireAccountWriter } from '../../utils/auth'
import { getDatabase } from '../../utils/database'
import { getObjectStore } from '../../utils/storage'
import { readLimitedBody } from '../../utils/request-body'
import { workspaceOperation } from '../../utils/workspace-operation'
import { parseProfileUpdate } from '../../services/profile-input'
import { saveProfile } from '../../services/profile'
export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountWriter(event)
    if (getHeader(event, 'content-type')?.split(';')[0] !== 'application/json')
      throw createError({ statusCode: 415, message: '请使用 JSON 提交资料。' })
    const raw = await readLimitedBody(event, 1_600_000)
    let value: unknown
    try {
      value = JSON.parse(raw.toString('utf8'))
    } catch {
      throw createError({ statusCode: 400, message: '资料不是有效的 JSON。' })
    }
    const input = parseProfileUpdate(value)
    // 单独修改昵称不依赖对象存储；修改或重置头像时才访问存储。
    return saveProfile(
      getDatabase(),
      input.avatar === undefined ? null : getObjectStore(),
      user.id,
      input,
    )
  }),
)
