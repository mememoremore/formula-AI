import { InferenceFailure } from './failure'

/** 适配器必须使用合并信号；调用库内不再叠加重试，重试次数交给任务队列。 */
export async function withInferenceDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parent?: AbortSignal,
  timeoutMs = 60_000,
): Promise<T> {
  parent?.throwIfAborted()
  const deadline = AbortSignal.timeout(timeoutMs)
  const signal = parent ? AbortSignal.any([parent, deadline]) : deadline
  let rejectAbort: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(signal.reason)
    signal.addEventListener('abort', rejectAbort, { once: true })
    if (signal.aborted) rejectAbort()
  })
  try {
    const result = await Promise.race([aborted, operation(signal)])
    signal.throwIfAborted()
    return result
  } catch (error) {
    if (parent?.aborted) throw parent.reason
    if (deadline.aborted) throw new InferenceFailure('TIMEOUT', '模型响应超时，请稍后重试。', true)
    throw error
  } finally {
    if (rejectAbort) signal.removeEventListener('abort', rejectAbort)
  }
}
