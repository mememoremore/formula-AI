import type { RecognitionResult } from '../../shared/types/api'

export function recognizeMock(): RecognitionResult {
  return {
    requestId: crypto.randomUUID(),
    latex: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
    modelVersion: 'mock-v1',
    isMock: true,
  }
}
