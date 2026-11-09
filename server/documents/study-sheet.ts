import katex from 'katex'
import { displayFormulaTitle } from '../../shared/formula-title'
import sharp from 'sharp'
import { pandoc, readApiVersion } from './formula-document'
import { normalizeLatex } from './formula-renderer'
import { formulaRenderOptions } from '../../shared/formula-validation'
import type { LearningQuestion } from '../../shared/schemas/learning'
export interface StudyFormula {
  title: string
  latex: string
  notes?: string
  conditions?: string
  mastery?: string
  masteryNotes?: string
  questions?: LearningQuestion[]
  explanation?: string
  image?: Buffer
}
export async function studySheetDocument(title: string, formulas: StudyFormula[]) {
  const blocks: unknown[] = []
  const text = (value: string) => ({ t: 'Para', c: [{ t: 'Str', c: value }] })
  const heading = (level: number, value: string) => ({
    t: 'Header',
    c: [level, ['', [], []], [{ t: 'Str', c: value }]],
  })
  blocks.push(heading(1, title))
  let imageBytes = 0
  for (const [index, formula] of formulas.entries()) {
    const latex = normalizeLatex(formula.latex)
    katex.renderToString(latex, { ...formulaRenderOptions, displayMode: true })
    blocks.push(heading(2, index + 1 + '. ' + displayFormulaTitle(formula.title)))
    if (formula.image) {
      const png = await sharp(formula.image)
        .resize({ width: 900, height: 700, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer()
      imageBytes += png.length
      if (imageBytes > 10 * 1024 * 1024) throw new Error('原图过多，请减少图片后导出')
      blocks.push({
        t: 'Para',
        c: [
          {
            t: 'Image',
            c: [
              ['', [], [['width', '450px']]],
              [],
              ['data:image/png;base64,' + png.toString('base64'), ''],
            ],
          },
        ],
      })
    }
    blocks.push({ t: 'Para', c: [{ t: 'Math', c: [{ t: 'DisplayMath' }, latex] }] })
    for (const [label, value] of [
      ['适用条件', formula.conditions],
      ['个人笔记', formula.notes],
      ['熟练度', formula.mastery],
      ['备注', formula.masteryNotes],
      ['已有AI解释', formula.explanation],
    ]) {
      if (!value) continue
      blocks.push(heading(3, label!))
      for (const line of value.split(/\n+/).filter(Boolean)) blocks.push(text(line))
    }
    if (formula.questions?.length) {
      blocks.push(heading(3, '复习问题'))
      for (const [position, question] of formula.questions.entries()) {
        blocks.push(text('问题' + (position + 1) + '：' + question.question))
        blocks.push(text('答案：' + question.answer))
      }
    }
  }
  const document = await pandoc(
    ['--from=json', '--to=docx', '--output=-', '--standalone', '--sandbox', '--fail-if-warnings'],
    JSON.stringify({ 'pandoc-api-version': await readApiVersion(), meta: {}, blocks }),
  )
  if (document.length > 8 * 1024 * 1024) throw new Error('学习清单超过8MB，请减少原图后重试')
  return document
}
