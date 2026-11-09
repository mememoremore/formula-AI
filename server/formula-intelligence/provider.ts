import type { ChatSettings } from '../chat/settings'
import { WorkspaceError } from '../services/workspace-error'
export async function intelligenceRequest(
  settings: ChatSettings,
  system: string,
  data: unknown,
  image?: { mimeType: string; bytes: Buffer },
  timeout = 60000,
  maxTokens = 1800,
): Promise<unknown> {
  if (settings.provider !== 'deepseek' || !settings.apiKey)
    throw new WorkspaceError(503, 'AI服务尚未配置。')
  const response = await fetch(settings.baseURL.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(timeout),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.apiKey },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0,
      max_tokens: maxTokens,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: image
            ? [
                { type: 'text', text: JSON.stringify(data) },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${image.mimeType};base64,${image.bytes.toString('base64')}`,
                  },
                },
              ]
            : JSON.stringify(data),
        },
      ],
    }),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new WorkspaceError(502, `AI请求失败（${response.status}），已保留原结果。`)
  }
  const raw = await response.text()
  if (raw.length > 100000) throw new WorkspaceError(502, 'AI返回内容过长。')
  const body = JSON.parse(raw) as { choices?: { message?: { content?: unknown } }[] }
  const content = body.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.length > 16000)
    throw new WorkspaceError(502, 'AI返回格式无效。')
  try {
    return JSON.parse(
      content
        .trim()
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, ''),
    )
  } catch {
    throw new WorkspaceError(502, 'AI未返回有效候选，已保留原结果。')
  }
}
