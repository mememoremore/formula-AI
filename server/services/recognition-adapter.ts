import type { RecognitionResult } from '../../shared/types/api'
import { recognizeMock } from './mock-recognition'

export interface RecognitionAdapter {
  recognize(
    input: { image: Buffer; mimeType: string; mode: 'handwritten' | 'printed'; requestId?: string },
    signal?: AbortSignal,
  ): Promise<RecognitionResult>
}

/** 模拟与Python适配器共用此边界；页面无需了解模型运行环境。 */
export const mockRecognitionAdapter: RecognitionAdapter = {
  async recognize(_input, signal) {
    signal?.throwIfAborted()
    return recognizeMock()
  },
}
