import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import katex from 'katex'

export const docxMimeType =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export class DocumentConversionError extends Error {
  constructor(
    message: string,
    readonly fatal = true,
  ) {
    super(message)
  }
}
export interface FormulaDocumentInput {
  title: string
  latex: string
  versionNumber: number
  isMock: boolean
}
export type FormulaDocumentConverter = (input: FormulaDocumentInput) => Promise<Buffer>

export function pandocExecutable() {
  if (process.env.PANDOC_PATH) return process.env.PANDOC_PATH
  const portable = resolve('.tools/pandoc-3.12.1/pandoc-3.12.1/pandoc.exe')
  return existsSync(portable) ? portable : 'pandoc'
}
async function pandoc(args: string[], input: string): Promise<Buffer> {
  return new Promise((resolveOutput, reject) => {
    const child = execFile(
      pandocExecutable(),
      args,
      { encoding: 'buffer', maxBuffer: 5 * 1024 * 1024, timeout: 20000, windowsHide: true },
      (error, stdout) => {
        if (error) {
          if (error.killed) {
            reject(new DocumentConversionError('文档转换超时，请稍后重试。', false))
            return
          }
          const missing = 'code' in error && error.code === 'ENOENT'
          reject(
            new DocumentConversionError(
              missing
                ? 'Word 转换工具未配置，请检查 Worker 的 Pandoc 安装。'
                : '这个 LaTeX 暂时无法完整转换为可编辑 Word，请检查公式或简化命令。',
              !missing,
            ),
          )
        } else resolveOutput(stdout)
      },
    )
    child.stdin?.on('error', () => {})
    child.stdin?.end(input, 'utf8')
  })
}
let apiVersion: Promise<number[]> | undefined
async function readApiVersion() {
  apiVersion ??= pandoc(['--from=markdown', '--to=json', '--sandbox'], '')
    .then(
      (data) =>
        (JSON.parse(data.toString('utf8')) as { 'pandoc-api-version': number[] })[
          'pandoc-api-version'
        ],
    )
    .catch((error) => {
      apiVersion = undefined
      throw error
    })
  return apiVersion
}

/** 只给转换器纯文字与 Math AST，不解析用户 Markdown、HTML、文件路径或 Shell 参数。 */
export const convertFormulaDocument: FormulaDocumentConverter = async (input) => {
  const latex = input.latex.trim()
  if (!latex || latex.length > 5000) throw new DocumentConversionError('公式内容为空或过长。')
  try {
    katex.renderToString(latex, {
      throwOnError: true,
      trust: false,
      maxExpand: 1000,
      maxSize: 20,
      strict: 'error',
    })
  } catch {
    throw new DocumentConversionError('公式语法或命令暂不支持，请修正 LaTeX 后再导出。')
  }
  const text = (value: string) => ({ t: 'Para', c: [{ t: 'Str', c: value }] })
  const document = {
    'pandoc-api-version': await readApiVersion(),
    meta: {
      title: { t: 'MetaString', c: input.title },
    },
    blocks: [
      text(`公式版本 v${input.versionNumber}`),
      ...(input.isMock ? [text('此公式源于固定模拟识别，请核对内容后使用。')] : []),
      { t: 'Para', c: [{ t: 'Math', c: [{ t: 'DisplayMath' }, latex] }] },
      text('LaTeX 源码'),
      { t: 'CodeBlock', c: [['', [], []], latex] },
    ],
  }
  const output = await pandoc(
    ['--from=json', '--to=docx', '--output=-', '--standalone', '--sandbox', '--fail-if-warnings'],
    JSON.stringify(document),
  )
  const files = unzipSync(new Uint8Array(output))
  const xml = strFromU8(files['word/document.xml'] ?? new Uint8Array())
  if ((xml.match(/<m:oMath(?:\s|>)/g) ?? []).length !== 1 || /<w:drawing\b|<w:pict\b/.test(xml))
    throw new DocumentConversionError('转换结果缺少可编辑公式，已停止导出。')
  const pageSize = '<w:pgSz w:w="11906" w:h="16838"/>'
  const documentXml = /<w:pgSz\b/.test(xml)
    ? xml.replace(/<w:pgSz\b[^>]*\/>/, pageSize)
    : xml.replace(
        '</w:sectPr>',
        `${pageSize}<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`,
      )
  files['word/document.xml'] = strToU8(documentXml)
  const styles = strFromU8(files['word/styles.xml'] ?? new Uint8Array())
  files['word/styles.xml'] = strToU8(
    styles
      .replace(/<w:color\b[^>]*\/>/g, '<w:color w:val="000000"/>')
      .replace(
        /<w:rFonts\b([^>]*?)\/>/g,
        (_, attributes: string) =>
          `<w:rFonts${attributes.replace(/\s+w:eastAsia="[^"]*"/g, '')} w:eastAsia="Microsoft YaHei"/>`,
      ),
  )
  return Buffer.from(zipSync(files))
}
