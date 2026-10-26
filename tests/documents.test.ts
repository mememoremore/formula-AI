import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import {
  convertFormulaDocument,
  DocumentConversionError,
} from '../server/documents/formula-document'

const samples = [
  { name: '分式', latex: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', element: 'm:f' },
  { name: '根式', latex: '\\sqrt{x^2+y^2}', element: 'm:rad' },
  { name: '积分', latex: '\\int_0^1 x^2\\,dx=\\frac{1}{3}', element: 'm:nary' },
  { name: '上下标', latex: 'a_i^2 + x^{n+1}', element: 'm:sSubSup' },
  { name: '矩阵', latex: '\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}', element: 'm:m' },
  { name: '纯文字标题', latex: 'E=mc^2', element: 'm:sSup' },
]
for (const [index, sample] of samples.entries())
  test(`${sample.name}导出为原生可编辑OMML，不包含公式图片`, async () => {
    const title =
      index === 5
        ? '标题 <xml> ![图片](https://example.invalid/test.png)'
        : `${sample.name}公式导出验收`
    const bytes = await convertFormulaDocument({
      title,
      latex: sample.latex,
      versionNumber: 2,
      isMock: true,
    })
    const files = unzipSync(bytes)
    const xml = strFromU8(files['word/document.xml']!)
    assert.match(xml, /<m:oMath[ >]/)
    assert.ok(
      xml.includes(`<${sample.element}>`) || xml.includes(`<${sample.element} `),
      `${sample.element} 结构缺失`,
    )
    assert.doesNotMatch(xml, /<w:drawing|<w:pict/)
    assert.equal(
      Object.keys(files).some((path) => path.startsWith('word/media/')),
      false,
    )
    assert.ok(xml.includes('v2'))
    assert.ok(xml.includes('固定模拟识别'))
    await mkdir('tmp/r1-test/documents', { recursive: true })
    await writeFile(`tmp/r1-test/documents/${sample.name}.docx`, bytes)
  })
test('不支持或损坏的LaTeX明确失败，不降级成图片或纯文本', async () => {
  for (const latex of ['', '\\frac{', '\\unknownCommand{x}', '\\includegraphics{/private/file}'])
    await assert.rejects(
      convertFormulaDocument({ title: '失败样例', latex, versionNumber: 1, isMock: false }),
      DocumentConversionError,
    )
})
