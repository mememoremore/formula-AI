import { test, expect } from 'vitest'
import {
  parseRecognitionTaskInput,
  parseConversationInput,
  parseChatTurnInput,
  parseExplanationInput,
  parseExportInput,
  parseRecognitionHistoryInput,
  parseConversationListInput,
} from '../server/services/task-input'
import { WorkspaceError } from '../server/services/workspace-error'
const id = 'ABCDEFAB-0000-0000-0000-000000000000'
function rejected(run: () => unknown, message: string) {
  let failure: unknown
  try {
    run()
  } catch (error) {
    failure = error
  }
  expect(failure).toBeInstanceOf(WorkspaceError)
  expect(failure).toMatchObject({ statusCode: 400, message })
}
test('recognition accepts missing/null/blank title, normalizes once and preserves request identifiers', () => {
  for (const requestedTitle of [undefined, null, '', ' \n '])
    expect(
      parseRecognitionTaskInput({
        fileId: id,
        requestKey: id,
        mode: 'printed',
        requestedTitle,
        extra: 1,
      }),
    ).toEqual({ fileId: id, requestKey: id, mode: 'printed', requestedTitle: null })
  expect(
    parseRecognitionTaskInput({
      fileId: id,
      requestKey: id,
      mode: 'handwritten',
      requestedTitle: ' '.repeat(120) + '名称 ',
    }).requestedTitle,
  ).toBe('名称')
})
test('recognition rejects invalid modes, missing identifiers and title control/UTF-16 bounds', () => {
  const base = { fileId: id, requestKey: id, mode: 'printed' }
  for (const input of [
    null,
    [],
    {},
    { ...base, mode: 'PRINTED' },
    { ...base, fileId: 'bad' },
    { ...base, requestedTitle: 123 },
    { ...base, requestedTitle: 'x\0' },
    { ...base, requestedTitle: '😀'.repeat(51) },
  ])
    rejected(() => parseRecognitionTaskInput(input), '图片、识别模式、公式名称或请求编号无效。')
})
test('conversation requires an explicit null or ID; questions keep raw whitespace and limits', () => {
  expect(parseConversationInput({ requestKey: id, formulaVersionId: null, extra: 1 })).toEqual({
    requestKey: id,
    formulaVersionId: null,
  })
  rejected(() => parseConversationInput({ requestKey: id }), '对话版本或请求编号无效。')
  expect(parseChatTurnInput({ requestKey: id, question: ' x \n' })).toEqual({
    requestKey: id,
    question: ' x \n',
  })
  for (const question of ['', '  ', 1, '😀'.repeat(1001)])
    rejected(() => parseChatTurnInput({ requestKey: id, question }), '请填写有效的提问和请求编号。')
})
test('explanation and export share ID syntax but retain different field names and errors', () => {
  expect(parseExplanationInput({ requestKey: id, versionId: id, extra: 1 })).toEqual({
    requestKey: id,
    versionId: id,
  })
  expect(parseExportInput({ requestKey: id, formulaVersionId: id })).toEqual({
    requestKey: id,
    formulaVersionId: id,
  })
  rejected(
    () => parseExplanationInput({ requestKey: id, versionId: null }),
    '公式版本或请求编号无效。',
  )
  rejected(
    () => parseExportInput({ requestKey: id, formulaVersionId: null }),
    '请提供有效的公式版本和请求编号。',
  )
})
test('history query contracts deliberately differ in lengths, NUL and missing search value', () => {
  expect(parseRecognitionHistoryInput({})).toEqual({ cursor: undefined, q: '' })
  expect(parseConversationListInput({})).toEqual({ cursor: undefined, q: undefined })
  expect(parseRecognitionHistoryInput({ cursor: 'not-a-uuid', q: ' x ' })).toEqual({
    cursor: 'not-a-uuid',
    q: 'x',
  })
  expect(parseConversationListInput({ cursor: '', q: 'x\0' })).toEqual({ cursor: '', q: 'x\0' })
  rejected(() => parseRecognitionHistoryInput({ q: 'x\0' }), '搜索或分页参数无效。')
  rejected(() => parseRecognitionHistoryInput({ q: '😀'.repeat(101) }), '搜索或分页参数无效。')
  rejected(
    () => parseConversationListInput({ q: 'x'.repeat(101), cursor: [] }),
    '搜索关键词不能超过100字。',
  )
  rejected(() => parseConversationListInput({ cursor: [] }), '分页参数无效。')
})
