import { resourceIdPattern } from './resource-id'

const imagePattern = /!\[公式图片\]\(\/api\/account\/files\/([0-9a-f-]{36})\/content\)/gi
export function chatFormulaImages(content: string) {
  return [...content.matchAll(imagePattern)]
    .filter((match) => resourceIdPattern.test(match[1]!))
    .map((match) => ({
      id: match[1]!,
      marker: match[0],
      src: '/api/account/files/' + match[1] + '/content',
    }))
}
export function withoutChatFormulaImages(content: string) {
  for (const image of chatFormulaImages(content)) content = content.replace(image.marker, '')
  return content.trim()
}
export function chatFormulaAttachment(fileId: string, latex: string) {
  if (!resourceIdPattern.test(fileId) || !latex.trim() || latex.includes('$$'))
    throw new Error('公式图片或识别结果无效，请校对后重试。')
  return '![公式图片](/api/account/files/' + fileId + '/content)\n$$' + latex.trim() + '$$'
}
/** Image references are local UI metadata; the text-only model receives recognized/edited math. */
export function chatQuestionForModel(content: string) {
  for (const image of chatFormulaImages(content))
    content = content.replace(image.marker, '[用户上传公式图片；以下为识别或用户校对的公式]')
  return content
}
