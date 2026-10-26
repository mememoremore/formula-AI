import type { StoredFile } from '../generated/prisma/client'
import type { UploadedImage } from '../../shared/types/workspace'

/** 只映射可展示字段，读取详情无需依赖上传或图像解码模块。 */
export function imageMetadata(file: StoredFile): UploadedImage {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    width: file.width!,
    height: file.height!,
  }
}
