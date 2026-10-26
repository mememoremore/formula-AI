export type DatabaseErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'VERSION_CONFLICT'

/** 数据层不依赖 HTTP；正式 API 接入时再映射为 400、404 和 409。 */
export class DatabaseOperationError extends Error {
  constructor(
    public readonly code: DatabaseErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DatabaseOperationError'
  }
}
