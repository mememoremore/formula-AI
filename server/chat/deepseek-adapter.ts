import { ChatDeepSeek } from '@langchain/deepseek'
import type { ChatAdapter } from './adapter'
import type { ChatSettings } from './settings'
import { buildChatMessages } from './prompt'
import { InferenceFailure, inferenceFailure } from '../inference/failure'

/** LangChain仅在此处使用；数据库、队列和页面都依赖自有ChatAdapter。 */
export function createDeepSeekAdapter(settings: ChatSettings): ChatAdapter {
  return {
    isMock: false,
    model: settings.model,
    async *stream(input, signal) {
      if (!settings.apiKey)
        throw new InferenceFailure('CONFIGURATION', 'DeepSeek密钥尚未配置，请联系管理员。', false)
      const model = new ChatDeepSeek({
        apiKey: settings.apiKey,
        model: settings.model,
        temperature: 0,
        maxTokens: 2048,
        maxRetries: 0,
        timeout: 60_000,
        modelKwargs: { thinking: { type: 'disabled' } },
        configuration: { baseURL: settings.baseURL, maxRetries: 0 },
      })
      try {
        for await (const chunk of await model.stream(buildChatMessages(input), { signal })) {
          const text =
            typeof chunk.content === 'string'
              ? chunk.content
              : chunk.content
                  .filter((part) => part.type === 'text')
                  .map((part) => ('text' in part ? part.text : ''))
                  .join('')
          const reason =
            chunk.response_metadata.finish_reason ?? chunk.response_metadata.finishReason
          // reasoning_content和原始响应元数据不写入数据库，也不向页面转发。
          yield { text, finishReason: typeof reason === 'string' ? reason : undefined }
        }
      } catch (error) {
        if (signal.aborted) throw signal.reason
        throw inferenceFailure(error)
      }
    },
  }
}
