import { InferenceFailure } from '../inference/failure'

export interface ChatSettings {
  provider: 'mock' | 'deepseek'
  apiKey: string
  model: string
  baseURL: string
}
export function readChatSettings(input: {
  provider?: string
  apiKey?: string
  model?: string
  baseURL?: string
}): ChatSettings {
  const provider = input.provider || 'mock'
  if (!['mock', 'deepseek'].includes(provider))
    throw new InferenceFailure('CONFIGURATION', 'AI服务类型配置无效。', false)
  const model = input.model || 'deepseek-flash'
  if (!model.trim() || model.length > 100 || /[\s\x00-\x1f]/.test(model))
    throw new InferenceFailure('CONFIGURATION', 'AI模型名称配置无效。', false)
  const baseURL = input.baseURL || 'https://api.deepseek.com'
  let endpoint: URL
  try {
    endpoint = new URL(baseURL)
  } catch {
    throw new InferenceFailure('CONFIGURATION', 'AI服务地址配置无效。', false)
  }
  if (
    (endpoint.protocol !== 'https:' &&
      !(
        endpoint.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
      )) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new InferenceFailure('CONFIGURATION', 'AI服务地址需要HTTPS或本机测试地址。', false)
  return {
    provider: provider as ChatSettings['provider'],
    model,
    baseURL: baseURL.replace(/\/$/, ''),
    apiKey: input.apiKey?.trim() ?? '',
  }
}
