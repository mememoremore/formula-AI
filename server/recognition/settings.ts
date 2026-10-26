import { InferenceFailure } from '../inference/failure'

export interface RecognitionSettings {
  provider: 'mock' | 'python'
  serviceUrl: string
  apiKey: string
}

/** 仅在服务端/Worker读取；容器内可使用 http://recognition:8000。 */
export function readRecognitionSettings(env: NodeJS.ProcessEnv): RecognitionSettings {
  const provider = env.NUXT_RECOGNITION_PROVIDER?.trim() || 'mock'
  if (provider !== 'mock' && provider !== 'python')
    throw new InferenceFailure('CONFIGURATION', '识别服务类型必须为 mock 或 python。', false)
  if (provider === 'mock') return { provider, serviceUrl: '', apiKey: '' }
  const apiKey = env.NUXT_RECOGNITION_API_KEY?.trim() || ''
  if (apiKey.length < 24 || /\s/.test(apiKey))
    throw new InferenceFailure('CONFIGURATION', 'Python识别服务密钥缺失或格式无效。', false)
  let url: URL
  try {
    url = new URL(env.NUXT_RECOGNITION_SERVICE_URL?.trim() || '')
  } catch {
    throw new InferenceFailure('CONFIGURATION', 'Python识别服务地址无效。', false)
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new InferenceFailure(
      'CONFIGURATION',
      '识别服务地址须为无凭据、查询参数的 HTTP(S) 地址。',
      false,
    )
  return { provider, serviceUrl: url.toString().replace(/\/$/, ''), apiKey }
}
