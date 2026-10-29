import { WorkspaceError } from '../services/workspace-error'
const MiB = 1024 * 1024
export interface ResourcePolicy {
  ownerBytes: number
  globalBytes: number
  ownerUploads: number
  globalUploads: number
  uploadsPerMinute: number
  ownerRecognitions: number
  globalRecognitions: number
  leaseSeconds: number
  bodySeconds: number
  fileGraceSeconds: number
  avatarGraceSeconds: number
}
/** 服务端专用；非法配置拒绝启动操作，不将负值/NaN 解释为无限制。 */
export function resourcePolicy(env: NodeJS.ProcessEnv = process.env): ResourcePolicy {
  const read = (key: string, fallback: number) => {
    const value = Number(env[`FORMULA_RESOURCE_${key}`] ?? fallback)
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(`Invalid resource configuration: ${key}`)
    return value
  }
  return {
    ownerBytes: read('OWNER_BYTES', 128 * MiB),
    globalBytes: read('GLOBAL_BYTES', 8 * 1024 * MiB),
    ownerUploads: read('OWNER_UPLOADS', 1),
    globalUploads: read('GLOBAL_UPLOADS', 2),
    uploadsPerMinute: read('UPLOADS_PER_MINUTE', 10),
    ownerRecognitions: read('OWNER_RECOGNITIONS', 2),
    globalRecognitions: read('GLOBAL_RECOGNITIONS', 16),
    leaseSeconds: read('LEASE_SECONDS', 3600),
    bodySeconds: read('BODY_SECONDS', 30),
    fileGraceSeconds: read('FILE_GRACE_SECONDS', 86400),
    avatarGraceSeconds: read('AVATAR_GRACE_SECONDS', 604800),
  }
}
export const MAX_AVATAR_BYTES = MiB
export const MAX_DOCX_BYTES = 5 * MiB
export class ResourceLimitError extends WorkspaceError {
  constructor(
    public readonly code: 'STORAGE_CAPACITY' | 'UPLOAD_BUSY' | 'UPLOAD_RATE' | 'RECOGNITION_BUSY',
    status: number,
    message: string,
  ) {
    super(status, message)
  }
}
