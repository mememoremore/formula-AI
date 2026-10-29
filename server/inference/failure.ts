export type InferenceCode =
  'CONFIGURATION' | 'INVALID_INPUT' | 'INVALID_OUTPUT' | 'RATE_LIMIT' | 'TIMEOUT' | 'UPSTREAM'

/** 只携带可展示的信息，原始供应商错误和请求头不得进入业务记录。 */
export class InferenceFailure extends Error {
  constructor(
    public readonly code: InferenceCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'InferenceFailure'
  }
}

export function inferenceFailure(error: unknown): InferenceFailure {
  if (error instanceof InferenceFailure) return error
  const failure = error as { status?: number; statusCode?: number }
  const status = failure?.status ?? failure?.statusCode
  if ([401, 402, 403, 404].includes(status ?? 0))
    return new InferenceFailure('CONFIGURATION', '模型服务配置或账户不可用，请联系管理员。', false)
  if ([400, 413, 415, 422].includes(status ?? 0))
    return new InferenceFailure(
      'INVALID_INPUT',
      '模型服务无法处理本次输入，请调整内容后再试。',
      false,
    )
  if (status === 429)
    return new InferenceFailure('RATE_LIMIT', '模型服务暂时繁忙，请稍后再试。', true)
  return new InferenceFailure('UPSTREAM', '模型服务暂时不可用，请稍后再试。', true)
}
