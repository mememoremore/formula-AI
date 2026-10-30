import type { FormulaExplanation } from '#shared/explanation'
/** Copy only user-facing, validated content. This format is independent of the model Prompt. */
export function explanationCopyText(value: FormulaExplanation): string {
  const sections: string[] = []
  const section = (title: string, rows: string[]) => {
    if (rows.length) sections.push(title + '\n' + rows.join('\n'))
  }
  section('概述', value.summary.trim() ? [value.summary] : [])
  section(
    '符号含义',
    value.symbols.map((v) => '$' + v.latex + '$：' + v.meaning),
  )
  section(
    '适用条件',
    value.conditions.map((v, i) => i + 1 + '. ' + v),
  )
  section(
    '理解与推导',
    value.steps.map(
      (v, i) => i + 1 + '. ' + v.title + '\n' + v.text + (v.latex ? '\n$$' + v.latex + '$$' : ''),
    ),
  )
  section(
    '应用例子',
    value.examples.map((v, i) => i + 1 + '. ' + v),
  )
  section(
    '注意事项',
    value.warnings.map((v, i) => i + 1 + '. ' + v),
  )
  return sections.join('\n\n')
}
