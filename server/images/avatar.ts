import sharp from 'sharp'
import { normalizeImage } from './normalize-image'
import { WorkspaceError } from '../services/workspace-error'
/** 服务端重新验证、裁成方形并移除元数据，客户端裁剪结果不能替代验证。 */
export async function normalizeAvatar(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!match || dataUrl.length > 1_500_000) throw new WorkspaceError(400, '头像格式或大小无效。')
  const bytes = Buffer.from(match[2]!, 'base64')
  if (!bytes.length || bytes.length > 1_000_000)
    throw new WorkspaceError(413, '头像过大，请重新裁剪。')
  const image = await normalizeImage(bytes, match[1]!)
  return sharp(image.data).resize(512, 512, { fit: 'cover' }).webp({ quality: 85 }).toBuffer()
}
