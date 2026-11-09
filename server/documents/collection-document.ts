import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { randomUUID } from 'node:crypto'
import { convertFormulaDocument, pandoc, readApiVersion } from './formula-document'
import { formulaPng } from './formula-renderer'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const XMLNS = 'http://www.w3.org/2000/xmlns/'
function xml(value: Uint8Array | undefined) {
  const source = strFromU8(value ?? new Uint8Array())
  if (!source || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('Word XML 内容无效。')
  return new DOMParser({
    onError: (level, message) => {
      throw new Error(message)
    },
  }).parseFromString(source, 'application/xml')
}
function unpack(data: Uint8Array) {
  if (!data.length || data.length > 8 * 1024 * 1024) throw new Error('Word 文件过大或为空。')
  let total = 0,
    count = 0
  const result = unzipSync(data, {
    filter: (entry) => {
      total += entry.originalSize
      count++
      if (total > 40 * 1024 * 1024 || count > 2000 || /(^|\/)\.\.(\/|$)|^\//.test(entry.name))
        throw new Error('Word 解压内容超出限制。')
      return true
    },
  })
  if (!result['word/document.xml'] || !result['[Content_Types].xml'])
    throw new Error('请选择有效的 DOCX 文档。')
  return result
}
export function appendFormulaDocx(existing: Uint8Array, generated: Uint8Array): Buffer {
  const target = unpack(existing),
    source = unpack(generated)
  const targetDoc = xml(target['word/document.xml']),
    sourceDoc = xml(source['word/document.xml'])
  const targetBody = targetDoc.getElementsByTagNameNS(W, 'body')[0],
    sourceBody = sourceDoc.getElementsByTagNameNS(W, 'body')[0]
  if (!targetBody || !sourceBody) throw new Error('Word 正文无效。')
  const attributes = sourceDoc.documentElement!.attributes
  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes.item(i)!
    if (attr.namespaceURI !== XMLNS) continue
    const current = targetDoc.documentElement!.getAttribute(attr.name)
    if (current && current !== attr.value) throw new Error('Word 命名空间不兼容，请新建文档导出。')
    if (!current) targetDoc.documentElement!.setAttributeNS(XMLNS, attr.name, attr.value)
  }
  const emptyRels = strToU8(`<Relationships xmlns="${REL}"/>`)
  const targetRels = xml(target['word/_rels/document.xml.rels'] ?? emptyRels)
  const sourceRels = xml(source['word/_rels/document.xml.rels'] ?? emptyRels)
  const contentTypes = xml(target['[Content_Types].xml'])
  const idMap = new Map<string, string>()
  const drawingIds = new Set(
    Array.from(targetDoc.getElementsByTagName('*'))
      .filter((element) => element.localName === 'docPr' || element.localName === 'cNvPr')
      .map((element) => element.getAttribute('id')),
  )
  let nextDrawingId = 1
  const section =
    Array.from(targetBody.childNodes).find((n) => n.nodeType === 1 && n.localName === 'sectPr') ??
    null
  for (const child of Array.from(sourceBody.childNodes)) {
    if (child.nodeType === 1 && child.localName === 'sectPr') continue
    const imported = targetDoc.importNode(child, true)
    const walk = (node: typeof imported) => {
      if (node.nodeType === 1) {
        const element = node as import('@xmldom/xmldom').Element
        for (const attribute of Array.from(element.attributes)) {
          if (attribute.namespaceURI !== R) continue
          let next = idMap.get(attribute.value)
          if (!next) {
            const relation = Array.from(sourceRels.getElementsByTagName('Relationship')).find(
              (r) => r.getAttribute('Id') === attribute.value,
            )
            const resource = relation?.getAttribute('Target') ?? ''
            if (
              !relation ||
              relation.getAttribute('TargetMode') === 'External' ||
              !/^media\/[\w.-]+$/.test(resource)
            )
              throw new Error('追加公式包含不支持的资源。')
            const data = source['word/' + resource]
            if (!data) throw new Error('公式图片资源缺失。')
            const filename = 'moxi-' + randomUUID() + '.png'
            target['word/media/' + filename] = data
            next = 'moxi' + randomUUID().replaceAll('-', '')
            const rel = targetRels.createElementNS(REL, 'Relationship')
            rel.setAttribute('Id', next)
            rel.setAttribute('Type', relation.getAttribute('Type') ?? '')
            rel.setAttribute('Target', 'media/' + filename)
            targetRels.documentElement!.appendChild(rel)
            const override = contentTypes.createElementNS(
              'http://schemas.openxmlformats.org/package/2006/content-types',
              'Override',
            )
            override.setAttribute('PartName', '/word/media/' + filename)
            override.setAttribute('ContentType', 'image/png')
            contentTypes.documentElement!.appendChild(override)
            idMap.set(attribute.value, next)
          }
          element.setAttributeNS(R, attribute.name, next)
        }
        // Drawing identifiers must remain unique in the combined document.
        if (element.localName === 'docPr' || element.localName === 'cNvPr') {
          while (drawingIds.has(String(nextDrawingId))) nextDrawingId++
          const id = String(nextDrawingId++)
          drawingIds.add(id)
          element.setAttribute('id', id)
        }
      }
      for (const nested of Array.from(node.childNodes)) walk(nested)
    }
    walk(imported)
    targetBody.insertBefore(imported, section)
  }
  const serializer = new XMLSerializer()
  target['word/document.xml'] = strToU8(serializer.serializeToString(targetDoc))
  target['word/_rels/document.xml.rels'] = strToU8(serializer.serializeToString(targetRels))
  target['[Content_Types].xml'] = strToU8(serializer.serializeToString(contentTypes))
  return Buffer.from(zipSync(target))
}
export async function convertFormulaCollection(
  formulas: string[],
  format: 'editable' | 'image',
  existing?: Uint8Array,
): Promise<Buffer> {
  if (!formulas.length || formulas.length > 20) throw new Error('请选择1至20条公式。')
  let output: Buffer
  if (format === 'editable') {
    const documents: Buffer[] = []
    for (const latex of formulas)
      documents.push(
        await convertFormulaDocument({ title: '', latex, versionNumber: 1, isMock: false }),
      )
    output = documents[0]!
    for (const doc of documents.slice(1)) output = appendFormulaDocx(output, doc)
  } else {
    const blocks = []
    for (const latex of formulas) {
      const png = await formulaPng(latex)
      blocks.push({
        t: 'Para',
        c: [
          {
            t: 'Image',
            c: [
              ['', [], [['width', `${Math.min(600, png.width)}px`]]],
              [],
              ['data:image/png;base64,' + png.data.toString('base64'), ''],
            ],
          },
        ],
      })
    }
    output = await pandoc(
      ['--from=json', '--to=docx', '--output=-', '--standalone', '--sandbox', '--fail-if-warnings'],
      JSON.stringify({ 'pandoc-api-version': await readApiVersion(), meta: {}, blocks }),
    )
  }
  return existing ? appendFormulaDocx(existing, output) : output
}
