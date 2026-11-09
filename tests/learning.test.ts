import { expect, test } from 'vitest'
import {
  learningInput,
  restoreInput,
  reviewInput,
  reviewSchedule,
  generatedQuestions,
} from '../shared/schemas/learning'

test('笔记限制字数、标签数并去除重复标签', () => {
  const value = {
    revision: 0,
    notes: '',
    conditions: '',
    question: '',
    tags: [' 力学 ', '力学'],
    reviewEnabled: true,
  }
  expect(learningInput.parse(value).tags).toEqual(['力学'])
  for (const invalid of [
    { notes: 'x'.repeat(6001) },
    { conditions: 'x'.repeat(2001) },
    { question: 'x'.repeat(601) },
    { tags: Array(13).fill('a') },
    { tags: [''] },
    { revision: -1 },
  ]) {
    expect(learningInput.safeParse({ ...value, ...invalid }).success).toBe(false)
  }
})

test('学习资料支持多组问答和熟练度；AI输出必须为三个不同且带答案的问题', () => {
  const questions = [0, 1, 2].map((i) => ({ question: '问题' + i, answer: '答案' + i }))
  expect(generatedQuestions.parse({ questions }).questions).toHaveLength(3)
  expect(generatedQuestions.safeParse({ questions: questions.slice(0, 2) }).success).toBe(false)
  expect(generatedQuestions.safeParse({ questions: Array(3).fill(questions[0]) }).success).toBe(
    false,
  )
  expect(
    generatedQuestions.safeParse({ questions: questions.map((q) => ({ ...q, answer: '' })) })
      .success,
  ).toBe(false)
  const base = {
    revision: 0,
    notes: '',
    conditions: '',
    reviewEnabled: false,
    questions: [
      {
        id: '12345678-1234-4234-8234-123456789abc',
        question: '自定义问题',
        answer: '自定义答案',
        source: 'manual',
      },
    ],
    mastery: 'MASTERED',
    masteryNotes: '',
  }
  expect(learningInput.parse(base).questions?.[0]?.answer).toBe('自定义答案')
  expect(learningInput.safeParse({ ...base, mastery: 'other' }).success).toBe(false)
  expect(learningInput.safeParse({ ...base, masteryNotes: 'a'.repeat(2001) }).success).toBe(false)
  expect(
    learningInput.safeParse({ ...base, questions: [base.questions[0], base.questions[0]] }).success,
  ).toBe(false)
  expect(
    learningInput.safeParse({ ...base, questions: Array(21).fill(base.questions[0]) }).success,
  ).toBe(false)
})

test('复习按10分钟、1天和递增天数排期，不会无限增长', () => {
  const now = new Date('2026-11-09T01:00:00Z')
  expect(reviewSchedule('again', 12, now)).toEqual({
    intervalDays: 0,
    nextReviewAt: new Date('2026-11-09T01:10:00Z'),
  })
  expect(reviewSchedule('hard', 12, now).intervalDays).toBe(1)
  expect(reviewSchedule('known', 0, now).intervalDays).toBe(3)
  expect(reviewSchedule('known', 3, now).intervalDays).toBe(6)
  expect(reviewSchedule('known', 60, now).intervalDays).toBe(90)
  expect(reviewInput.safeParse({ revision: 1, rating: 'invalid' }).success).toBe(false)
})

test('恢复操作只接受有效记录类型及非空有界编号列表', () => {
  const id = '12345678-1234-4234-8234-123456789abc'
  expect(restoreInput.parse({ kind: 'formula', ids: [id, id] }).ids).toEqual([id])
  for (const value of [
    { kind: 'file', ids: [id] },
    { kind: 'formula', ids: [] },
    { kind: 'batch', ids: ['bad'] },
    { kind: 'recognition', ids: Array(101).fill(id) },
  ])
    expect(restoreInput.safeParse(value).success).toBe(false)
})
