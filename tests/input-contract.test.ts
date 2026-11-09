import { parseFormulaEdit, parseFormulaFavorite } from '../server/services/formula-input'
import {
  parseCategoryInput,
  parseFormulaCategory,
  parseLibraryFilters,
  checkedCategoryName,
} from '../server/services/library-input'
import { test, expect, vi } from 'vitest'
import * as formulaValidation from '../shared/formula-validation'
import { parseManualFormula } from '../server/services/manual-formula-input'
import { WorkspaceError } from '../server/services/workspace-error'
import { conversationNameInputSchema } from '../shared/schemas/conversation-name'
import { formulaBatchDeleteSchema } from '../shared/schemas/formula-input'

test('formula batch deletion validates, bounds and deduplicates resource IDs', () => {
  const id = 'ABCDEFAB-0000-0000-0000-000000000000'
  expect(formulaBatchDeleteSchema.parse({ ids: [id, id.toLowerCase()] })).toEqual({
    ids: [id.toLowerCase()],
  })
  for (const ids of [[], Array(101).fill(id), ['bad'], null, id])
    expect(formulaBatchDeleteSchema.safeParse({ ids }).success).toBe(false)
})

test('conversation names normalize, have 1–40 characters and reject controls', () => {
  expect(conversationNameInputSchema.parse({ title: ' Cafe\u0301 ', extra: true })).toEqual({
    title: 'Café',
  })
  expect(conversationNameInputSchema.parse({ title: '名'.repeat(40) }).title).toHaveLength(40)
  for (const title of ['', ' ', '名'.repeat(41), 'a\nb', 'a\0b', 'a\u007fb', null, 123])
    expect(conversationNameInputSchema.safeParse({ title }).success).toBe(false)
})

test('recent saved filter uses explicit boolean strings and leaves legacy queries unchanged', () => {
  expect(parseLibraryFilters({ saved: 'true' })).toMatchObject({ saved: true })
  expect(parseLibraryFilters({ saved: 'false' })).not.toHaveProperty('saved')
  for (const saved of [true, 'TRUE', '1', ['true']])
    rejected(() => parseLibraryFilters({ saved }), '搜索或分页参数无效，请重新选择。')
})

const id = 'ABCDEFAB-0000-0000-0000-000000000000'
function rejected(run: () => unknown, message: string) {
  expect(run).toThrowError(WorkspaceError)
  try {
    run()
  } catch (error) {
    expect(error).toMatchObject({ statusCode: 400, message })
  }
}
test('manual create preserves root/field/content error priority and rejects non-object JSON', () => {
  for (const input of [undefined, null, [], 'x', 1, false])
    rejected(() => parseManualFormula(input), '请求内容无效。')
  for (const input of [
    { title: '', latex: '' },
    { requestKey: 'bad', title: '', latex: '' },
    { requestKey: id, title: 1, latex: '' },
  ])
    rejected(() => parseManualFormula(input), '请提供名称、LaTeX 和有效请求编号。')
  rejected(
    () => parseManualFormula({ requestKey: id, title: '', latex: '' }),
    '公式名称需要包含 1～100 个字符，不能含控制字符。',
  )
  rejected(
    () => parseManualFormula({ requestKey: id, title: '名称', latex: '' }),
    'LaTeX 需要包含 1～5000 个字符。',
  )
})
test('create normalizes only after validation; legacy UUID and unknown fields stay compatible', () => {
  const input = {
    requestKey: id,
    title: ' '.repeat(120) + '名称 ',
    latex: ' x+1\n',
    extra: 'ignored',
  }
  const before = structuredClone(input)
  expect(parseManualFormula(input)).toEqual({
    requestKey: id.toLowerCase(),
    title: '名称',
    latex: 'x+1',
  })
  expect(input).toEqual(before)
  rejected(
    () => parseManualFormula({ requestKey: id, title: '\n名称', latex: 'x' }),
    '公式名称需要包含 1～100 个字符，不能含控制字符。',
  )
})
test('name limits use UTF-16 code units instead of Unicode code point count', () => {
  expect(
    parseManualFormula({ requestKey: id, title: '😀'.repeat(50), latex: 'x' }).title,
  ).toHaveLength(100)
  rejected(
    () => parseManualFormula({ requestKey: id, title: '😀'.repeat(51), latex: 'x' }),
    '公式名称需要包含 1～100 个字符，不能含控制字符。',
  )
  expect(checkedCategoryName('😀'.repeat(25))).toHaveLength(50)
  rejected(
    () => checkedCategoryName('😀'.repeat(26)),
    '分类名称需要包含1～50个字符，不能包含换行或控制字符。',
  )
})
test('category normalization is trim then NFC, including trimmed edge controls', () => {
  expect(checkedCategoryName(' \nCafe\u0301\t')).toBe('Café')
  for (const input of [undefined, null, 123, [], {}])
    rejected(() => checkedCategoryName(input), '请填写分类名称。')
  for (const input of ['', ' '.repeat(20), 'a\nb', 'a\u007fb', 'x'.repeat(51)])
    rejected(
      () => checkedCategoryName(input),
      '分类名称需要包含1～50个字符，不能包含换行或控制字符。',
    )
})
test('library filters keep case and raw-length limits, strip extra fields and parse exact boolean strings', () => {
  expect(parseLibraryFilters({})).toEqual({
    q: undefined,
    category: undefined,
    cursor: undefined,
    favorites: false,
  })
  expect(
    parseLibraryFilters({
      q: ' x ',
      category: id,
      cursor: id,
      favorites: 'true',
      extra: 'ignored',
    }),
  ).toEqual({ q: 'x', category: id, cursor: id, favorites: true })
  expect(parseLibraryFilters({ category: 'uncategorized', favorites: 'false' }).favorites).toBe(
    false,
  )
  expect(parseLibraryFilters({ q: '😀'.repeat(100) }).q).toHaveLength(200)
})
test('library rejects invalid scalar types without coercion and does not trim before the length limit', () => {
  for (const input of [
    { q: ['a', 'b'] },
    { q: null },
    { q: ' '.repeat(201) },
    { q: 'a\0b' },
    { category: '' },
    { category: 'UNCATEGORIZED' },
    { cursor: 'bad' },
    { cursor: null },
    { favorites: true },
    { favorites: 1 },
    { favorites: 'TRUE' },
    { q: '😀'.repeat(100) + 'x' },
  ])
    rejected(() => parseLibraryFilters(input), '搜索或分页参数无效，请重新选择。')
})

test('edit preserves expectedTitle error priority and does not normalize conflict snapshots', () => {
  const message = '请填写有效的名称、LaTeX 和编辑版本。',
    expected = '保存需要编辑时的原标题（expectedTitle），请刷新页面后重新编辑。'
  for (const body of [null, [], 1, 'x']) rejected(() => parseFormulaEdit(body), message)
  for (const body of [{}, { expectedTitle: 1, title: null }, { expectedTitle: ' ', latex: 1 }])
    rejected(() => parseFormulaEdit(body), expected)
  for (const body of [
    { expectedTitle: '原名' },
    { expectedTitle: '原名', title: ' '.repeat(100) + 'x', latex: 'x', expectedVersionId: id },
    { expectedTitle: '原名', title: 'x', latex: 'x', expectedVersionId: 'bad' },
  ])
    rejected(() => parseFormulaEdit(body), message)
  expect(
    parseFormulaEdit({
      expectedTitle: ' 原名 ',
      title: ' 新名 ',
      latex: ' x \n',
      expectedVersionId: id,
      extra: 1,
    }),
  ).toEqual({ expectedTitle: ' 原名 ', title: ' 新名 ', latex: ' x \n', expectedVersionId: id })
})
test('edit keeps the existing structural contract; specialized formula rules remain in their business layer', () => {
  const input = { expectedTitle: '原名', title: 'x\n', latex: '\\frac{', expectedVersionId: id }
  expect(parseFormulaEdit(input)).toEqual(input)
  rejected(
    () => parseFormulaEdit({ ...input, expectedTitle: '😀'.repeat(51) }),
    '保存需要编辑时的原标题（expectedTitle），请刷新页面后重新编辑。',
  )
})
test('favorite and category assignment require exact JSON primitives and strip unknown fields', () => {
  for (const favorite of [true, false])
    expect(parseFormulaFavorite({ favorite, ownerId: 'ignored' })).toEqual({ favorite })
  for (const body of [null, [], {}, { favorite: 0 }, { favorite: 'false' }, { favorite: null }])
    rejected(() => parseFormulaFavorite(body), '收藏状态必须为布尔值。')
  expect(parseFormulaCategory({ categoryId: null, extra: 1 })).toEqual({ categoryId: null })
  expect(parseFormulaCategory({ categoryId: id })).toEqual({ categoryId: id })
  for (const body of [
    null,
    [],
    {},
    { categoryId: undefined },
    { categoryId: '' },
    { categoryId: 1 },
  ])
    rejected(() => parseFormulaCategory(body), '请选择有效的分类或未分类。')
})
test('category request shape shares normalization and never returns unchecked properties', () => {
  expect(parseCategoryInput({ name: ' Cafe\u0301 ', ownerId: 'ignored' })).toEqual({ name: 'Café' })
  for (const body of [null, [], {}, { name: 12 }])
    rejected(() => parseCategoryInput(body), '请填写分类名称。')
})
test('validation failures expose deliberate messages, not raw input or Zod issues', () => {
  let failure: unknown
  try {
    parseFormulaFavorite({ favorite: 'private-fixture-value', secret: 'private-fixture-secret' })
  } catch (error) {
    failure = error
  }
  expect(failure).toBeInstanceOf(WorkspaceError)
  expect((failure as Error).message).toBe('收藏状态必须为布尔值。')
  expect(JSON.stringify(failure)).not.toMatch(/private-fixture|issues|received|expected/)
})

test('invalid request structure never reaches the specialized formula validator', () => {
  const validate = vi.spyOn(formulaValidation, 'manualFormulaFeedback').mockImplementation(() => {
    throw new Error('specialized validation must not run')
  })
  try {
    rejected(
      () => parseManualFormula({ requestKey: 'bad', title: '名称', latex: 'x' }),
      '请提供名称、LaTeX 和有效请求编号。',
    )
    expect(validate).not.toHaveBeenCalled()
  } finally {
    validate.mockRestore()
  }
})
