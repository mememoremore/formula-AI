import { expect, test } from 'vitest'
import {
  ruleCandidates,
  checkedRecommendations,
  type RecommendationCandidate,
} from '../shared/recommendations'
const candidate = (id: number, mastery = 'UNFAMILIAR', due = false): RecommendationCandidate => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  title: '公式',
  latex: 'x=' + id,
  versionId: 'version',
  category: null,
  mastery,
  due,
  conditions: '',
  notes: '',
  masteryNotes: '',
})
test('规则优先未掌握和到期公式，最多20条候选且同式去重', () => {
  const rows = [
    candidate(1, 'MASTERED'),
    candidate(2),
    candidate(3, 'UNFAMILIAR', true),
    { ...candidate(4), latex: 'x= 2' },
  ]
  expect(ruleCandidates(rows).map((row) => row.id)).toEqual([
    candidate(3).id,
    candidate(2).id,
    candidate(1).id,
  ])
  expect(ruleCandidates(Array.from({ length: 30 }, (_, index) => candidate(index)))).toHaveLength(
    20,
  )
})
test('AI只可选择候选ID，不重复，库少时不凑数', () => {
  const rows = [candidate(1), candidate(2)]
  const output = {
    recommendations: rows.map((row) => ({ id: row.id, reason: '适合当前学习目的' })),
  }
  expect(checkedRecommendations(output, rows)).toHaveLength(2)
  expect(() =>
    checkedRecommendations(
      { recommendations: [output.recommendations[0], output.recommendations[0]] },
      rows,
    ),
  ).toThrow()
  expect(() =>
    checkedRecommendations({ recommendations: [{ id: candidate(9).id, reason: '库外' }] }, rows),
  ).toThrow()
  expect(() =>
    checkedRecommendations({ recommendations: [output.recommendations[0]] }, [
      ...rows,
      candidate(3),
    ]),
  ).toThrow()
})

const generated = (kind = 'DERIVATION') => ({
  kind,
  sourceIds: [candidate(1).id],
  title: '推导公式',
  latex: 'x=2',
  reason: '继续推导',
  conditions: '实数范围',
  steps: [
    { latex: 'x+1=3', explanation: '来自原式' },
    { latex: 'x=2', explanation: '两边减一' },
  ],
})
test('四类新公式可引用库内来源，且不要求来源公式数量凑足三条', () => {
  for (const kind of ['DERIVATION', 'STRUCTURAL', 'SEMANTIC', 'SIMPLIFICATION'])
    expect(
      checkedRecommendations({ recommendations: [generated(kind)] }, [candidate(1)]),
    ).toHaveLength(1)
})
test('拒绝不存在的来源、重复来源、缺少条件、无效排版与不完整连续推导', () => {
  for (const item of [
    { ...generated(), sourceIds: [candidate(9).id] },
    { ...generated(), sourceIds: [candidate(1).id, candidate(1).id] },
    { ...generated(), conditions: '' },
    { ...generated(), latex: '\\frac{' },
    { ...generated(), latex: '\\href{https://bad.test}{x}' },
    { ...generated(), steps: [{ latex: 'x=2', explanation: '一步' }] },
    { ...generated(), steps: [{ latex: '\\frac{', explanation: '错误' }, ...generated().steps] },
  ])
    expect(() => checkedRecommendations({ recommendations: [item] }, [candidate(1)])).toThrow()
})
test('不把已存在公式或重复的新公式当作新推荐，未知类型被拒绝', () => {
  for (const recommendations of [
    [{ ...generated(), latex: 'x= 1' }],
    [generated(), generated()],
    [generated('OTHER')],
  ])
    expect(() => checkedRecommendations({ recommendations }, [candidate(1)])).toThrow()
})

test('缓存展示新公式保留来源，保存编号稳定，非法来源缓存回退规则而不调用AI', async () => {
  const { readRecommendations } = await import('../server/database/recommendations')
  const rows = [candidate(1)]
  let items: unknown = [generated()]
  const db = {
    user: { findUniqueOrThrow: async () => ({ grade: '高一', learningPurpose: '理解推导' }) },
    $queryRaw: async () => rows,
    formula: { aggregate: async () => ({ _count: 1, _max: { updatedAt: new Date(0) } }) },
    formulaLearning: { aggregate: async () => ({ _max: { updatedAt: null } }) },
    category: { aggregate: async () => ({ _count: 0, _max: { updatedAt: null } }) },
    recommendationCache: {
      findUnique: async () => ({
        status: 'READY',
        items,
        error: null,
        expiresAt: new Date(Date.now() + 60000),
      }),
    },
  } as unknown as import('../server/generated/prisma/client').PrismaClient
  const settings = {
    provider: 'mock' as const,
    apiKey: '',
    model: 'test',
    baseURL: 'http://127.0.0.1:1',
  }
  const first = await readRecommendations(db, 'owner', settings),
    second = await readRecommendations(db, 'owner', settings)
  expect(first.status).toBe('READY')
  expect(first.items[0]!.id).toMatch(/^[0-9a-f-]{36}$/)
  expect(second.items[0]!.id).toBe(first.items[0]!.id)
  expect(first.items[0]).toMatchObject({
    kind: 'DERIVATION',
    sources: [{ id: candidate(1).id, latex: 'x=1' }],
  })
  items = [{ id: candidate(1).id, reason: '旧库内推荐' }]
  expect((await readRecommendations(db, 'owner', settings)).items).toEqual([])
  items = [{ ...generated(), sourceIds: [candidate(9).id] }]
  const fallback = await readRecommendations(db, 'owner', settings)
  expect(fallback.status).toBe('FAILED')
  expect(fallback.source).toBe('RULES')
  expect(fallback.items).toEqual([])
})

test('新公式与整个公式库比对，拒绝候选集以外的已保存公式', () => {
  expect(() =>
    checkedRecommendations({ recommendations: [generated()] }, [candidate(1)], ['x=1', 'x= 2']),
  ).toThrow()
})
