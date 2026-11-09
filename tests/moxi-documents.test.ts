import assert from 'node:assert/strict'
import { test } from 'node:test'
import { unzipSync, strFromU8, strToU8, zipSync } from 'fflate'
import { DOMParser } from '@xmldom/xmldom'
import { formulaToText } from '../server/documents/formula-text'
import {
  appendFormulaDocx,
  convertFormulaCollection,
} from '../server/documents/collection-document'

test('公式文本与小程序一致：上下标、分式、根式、分行', () => {
  assert.equal(formulaToText('x^2+y_1'), 'x² + y₁')
  assert.equal(formulaToText('\\frac{a+b}{c}'), '((a + b)/c)')
  assert.equal(formulaToText('\\sqrt{x}'), '√(x)')
  assert.throws(() => formulaToText('\\includegraphics{a}'))
})
test('批量 Word 只含公式；可编辑版和图片版均支持安全追加', async () => {
  const formulas = ['x+1=2', '\\frac{a}{b}']
  const editable = await convertFormulaCollection(formulas, 'editable')
  const editableXml = strFromU8(unzipSync(editable)['word/document.xml']!)
  assert.equal((editableXml.match(/<m:oMath[ >]/g) ?? []).length, 2)
  assert.doesNotMatch(editableXml, /<w:t[ >]|LaTeX|模拟|<w:drawing/)
  const image = await convertFormulaCollection(formulas, 'image')
  const imageFiles = unzipSync(image)
  const imageXml = strFromU8(imageFiles['word/document.xml']!)
  assert.equal((imageXml.match(/<w:drawing[ >]/g) ?? []).length, 2)
  assert.doesNotMatch(imageXml, /<w:t[ >]|LaTeX|模拟/)
  const base = unzipSync(editable)
  base['word/document.xml'] = strToU8(
    editableXml.replace('<w:body>', '<w:body><w:p><w:r><w:t>原文保留</w:t></w:r></w:p>'),
  )
  const combined = appendFormulaDocx(zipSync(base), image)
  const files = unzipSync(combined),
    combinedXml = strFromU8(files['word/document.xml']!)
  assert.match(combinedXml, /原文保留/)
  assert.equal((combinedXml.match(/<m:oMath[ >]/g) ?? []).length, 2)
  assert.equal((combinedXml.match(/<w:drawing[ >]/g) ?? []).length, 2)
  const relationships = new DOMParser().parseFromString(
    strFromU8(files['word/_rels/document.xml.rels']!),
    'application/xml',
  )
  for (const match of combinedXml.matchAll(/r:embed="([^"]+)"/g)) {
    const relation = Array.from(relationships.getElementsByTagName('Relationship')).find(
      (r) => r.getAttribute('Id') === match[1],
    )
    assert.ok(relation)
    assert.ok(files['word/' + relation.getAttribute('Target')])
  }
  assert.throws(() => appendFormulaDocx(strToU8('not a document'), image))
})
