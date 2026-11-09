import { afterEach, expect, test, vi } from 'vitest'
import {
  copyEditableFormulas,
  copyFormulaImage,
  copySourceFormulas,
  formulaClipboardContent,
} from '../../app/utils/formula-clipboard'

afterEach(() => vi.unstubAllGlobals())

test('源公式保留分式、根式、上下标结构与顺序，文本回退无损保留 LaTeX', () => {
  const formulas = ['h=\\frac{1}{2}gt^2', 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', 'V_t^2-V_0^2=2ax']
  const output = formulaClipboardContent(formulas)
  const document = new DOMParser().parseFromString(output.html, 'text/html')
  expect(document.querySelectorAll('math')).toHaveLength(3)
  expect(document.querySelectorAll('mfrac')).toHaveLength(2)
  expect(document.querySelectorAll('msqrt')).toHaveLength(1)
  expect(document.querySelectorAll('msubsup').length).toBeGreaterThan(0)
  expect(document.querySelectorAll('annotation,script,img,a')).toHaveLength(0)
  expect(document.querySelector('math')?.getAttribute('xmlns')).toBe(
    'http://www.w3.org/1998/Math/MathML',
  )
  expect(output.text).toBe(formulas.join('\n'))
  const source = new DOMParser().parseFromString(output.mathml, 'application/xml')
  expect(source.querySelectorAll('math')).toHaveLength(1)
  expect(source.querySelectorAll('mtr')).toHaveLength(3)
  expect(source.querySelectorAll('mfrac')).toHaveLength(2)
})

test('用户文字不能注入 HTML，空公式、超量和错误语法不能复制', () => {
  const output = formulaClipboardContent(['\\text{<img src=x onerror=alert(1)>}'])
  const document = new DOMParser().parseFromString(output.html, 'text/html')
  expect(document.querySelectorAll('img,script')).toHaveLength(0)
  expect(() => formulaClipboardContent([])).toThrow()
  expect(() => formulaClipboardContent([''])).toThrow()
  expect(() => formulaClipboardContent(Array(21).fill('x'))).toThrow()
  expect(() => formulaClipboardContent(['\\frac{a}'])).toThrow()
})

function clipboard() {
  const writes: Record<string, Blob | Promise<Blob>>[] = []
  const write = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { write } })
  vi.stubGlobal(
    'ClipboardItem',
    class {
      constructor(readonly data: Record<string, Blob | Promise<Blob>>) {
        writes.push(data)
      }
    },
  )
  return { writes, write }
}

test('可编辑复制同时写入 HTML MathML 和文本，不依赖文本转换接口', async () => {
  const { writes, write } = clipboard()
  await copyEditableFormulas(['\\frac{a}{b}'])
  expect(write).toHaveBeenCalledTimes(1)
  expect(await (writes[0]!['text/html'] as Blob).text()).toContain('<mfrac>')
  expect(await (writes[0]!['text/plain'] as Blob).text()).toBe('\\frac{a}{b}')
  expect(writes[0]!['image/png']).toBeUndefined()
})

test('图片在点击时立即申请剪贴板写入，支持异步渲染而不丢失用户手势', async () => {
  const { writes, write } = clipboard()
  let resolve!: (value: Blob) => void
  const image = new Promise<Blob>((done) => {
    resolve = done
  })
  const load = vi.fn(() => image)
  const copied = copyFormulaImage(load)
  expect(load).toHaveBeenCalledTimes(1)
  expect(write).toHaveBeenCalledTimes(1)
  expect(writes[0]!['image/png']).toBe(image)
  resolve(new Blob(['png'], { type: 'image/png' }))
  await copied
})

test('不支持富格式或权限失败时明确报错，不悄悄变成扁平文本', async () => {
  vi.stubGlobal('navigator', { clipboard: {} })
  await expect(copyEditableFormulas(['x'])).rejects.toThrow('不支持复制可编辑公式')
  const load = vi.fn()
  await expect(copyFormulaImage(load)).rejects.toThrow('不支持复制图片')
  expect(load).not.toHaveBeenCalled()
  const { write } = clipboard()
  write.mockRejectedValue(new Error('denied'))
  await expect(copyEditableFormulas(['x'])).rejects.toThrow('denied')
})

test('Word 源公式只写标准 MathML 文本，单公式保留结构而不包多行表格', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  await copySourceFormulas(['x=\\frac{a}{b}'])
  const source = writeText.mock.calls[0]![0] as string
  expect(source).toMatch(/^<math xmlns=/)
  expect(source).toContain('<mfrac>')
  expect(source).not.toContain('<mtable')
  expect(source).not.toContain('<annotation')
})
