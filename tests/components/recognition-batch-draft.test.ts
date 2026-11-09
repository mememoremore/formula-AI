import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { computed, defineComponent, h, onMounted, onScopeDispose, ref, watch } from 'vue'
import { mount } from '@vue/test-utils'
import { useRecognitionBatchDraft } from '../../app/composables/useRecognitionBatchDraft'

const owner = ref<string | undefined>('owner')
const transport = vi.fn()
const navigate = vi.fn()
let guard: () => boolean | Promise<boolean>

function draft() {
  let state!: ReturnType<typeof useRecognitionBatchDraft>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useRecognitionBatchDraft(owner)
        return () => h('div')
      },
    }),
  )
  return { state, wrapper }
}
function files(count = 6) {
  return {
    original: new File(['original'], 'original.png', { type: 'image/png' }),
    parts: Array.from(
      { length: count },
      (_, i) => new File(['crop' + i], i + '.png', { type: 'image/png' }),
    ),
  }
}
beforeEach(() => {
  owner.value = 'owner'
  sessionStorage.clear()
  transport.mockReset()
  navigate.mockReset()
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('onMounted', onMounted)
  vi.stubGlobal('onScopeDispose', onScopeDispose)
  vi.stubGlobal('onBeforeRouteLeave', (value: () => boolean | Promise<boolean>) => {
    guard = value
  })
  vi.stubGlobal('useAccountFetch', () => transport)
  vi.stubGlobal('navigateTo', navigate)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  transport.mockImplementation(async (url: string) => {
    if (url.endsWith('/usage')) return { items: [{ kind: 'RECOGNITION', remaining: 20 }] }
    if (url.endsWith('/files')) return { image: { id: crypto.randomUUID() } }
    return { id: 'batch-id' }
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('六个区域全部上传并持久化为同一批次，再进入结果页', async () => {
  const { state } = draft(),
    { original, parts } = files()
  state.prepareImage(original, parts)
  expect(state.total.value).toBe(6)
  expect(await state.start()).toBe('batch-id')
  const uploads = transport.mock.calls.filter(([url]) => url.endsWith('/files'))
  const creations = transport.mock.calls.filter(([url]) => url.endsWith('/recognition-batches'))
  expect(uploads).toHaveLength(7)
  expect(creations).toHaveLength(1)
  expect(creations[0]![1].body).toMatchObject({
    mode: 'multiple',
    images: [{ parts: Array(6).fill({ fileId: expect.any(String) }) }],
  })
  expect(navigate).toHaveBeenCalledWith('/batches/batch-id')
  expect(transport.mock.calls.some(([url]) => url.endsWith('/recognitions'))).toBe(false)
  expect(await guard()).toBe(true)
})

test('部分上传失败后重试复用已上传区域和原请求编号', async () => {
  const { state } = draft(),
    { original, parts } = files()
  const normal = transport.getMockImplementation()!
  let calls = 0
  transport.mockImplementation(async (url: string, options: unknown) => {
    if (url.endsWith('/files') && ++calls === 4) throw new Error('upload disconnected')
    return normal(url, options)
  })
  state.prepareImage(original, parts)
  await state.start()
  expect(navigate).not.toHaveBeenCalled()
  const failedKey = transport.mock.calls.filter(([url]) => url.endsWith('/files'))[3]![1].headers[
    'x-upload-key'
  ]
  state.prepareImage(original, parts)
  await state.start()
  const uploads = transport.mock.calls.filter(([url]) => url.endsWith('/files'))
  expect(uploads).toHaveLength(8)
  expect(uploads[4]![1].headers['x-upload-key']).toBe(failedKey)
  expect(navigate).toHaveBeenCalledTimes(1)
})

test('恢复的服务端图片已过期时保留本地裁剪，下一次提交重新上传', async () => {
  const { state } = draft(),
    { original, parts } = files(2)
  const normal = transport.getMockImplementation()!
  let fail = true
  transport.mockImplementation(async (url: string, options: unknown) => {
    if (url.endsWith('/recognition-batches') && fail) {
      fail = false
      throw Object.assign(new Error('expired uploads'), { statusCode: 404 })
    }
    return normal(url, options)
  })
  state.prepareImage(original, parts)
  await state.start()
  expect(state.pending.value).toBeNull()
  expect(state.total.value).toBe(2)
  expect(transport.mock.calls.filter(([url]) => url.endsWith('/files'))).toHaveLength(3)
  const oldKey = transport.mock.calls.find(([url]) => url.endsWith('/files'))![1].headers[
    'x-upload-key'
  ]
  await state.start()
  const uploads = transport.mock.calls.filter(([url]) => url.endsWith('/files'))
  expect(uploads).toHaveLength(6)
  expect(uploads[3]![1].headers['x-upload-key']).not.toBe(oldKey)
  expect(navigate).toHaveBeenCalledTimes(1)
})

test('提交响应丢失后刷新可恢复全部六个区域，不再上传或生成新编号', async () => {
  const first = draft(),
    { original, parts } = files()
  const normal = transport.getMockImplementation()!
  transport.mockImplementation(async (url: string, options: unknown) => {
    if (url.endsWith('/recognition-batches'))
      throw Object.assign(new Error('lost response'), { statusCode: 503 })
    return normal(url, options)
  })
  first.state.prepareImage(original, parts)
  await first.state.start()
  const body = first.state.pending.value
  expect(body?.images[0]?.parts).toHaveLength(6)
  first.wrapper.unmount()
  transport.mockReset().mockImplementation(normal)
  const second = draft()
  expect(second.state.pending.value).toEqual(body)
  await second.state.start()
  expect(transport).toHaveBeenCalledTimes(1)
  expect(transport.mock.calls[0]![1].body).toEqual(body)
  expect(sessionStorage.length).toBe(0)
})

test('多公式图只选一个区域仍可提交，额度不足时不上传也不创建任务', async () => {
  const { state } = draft(),
    { original, parts } = files(1)
  state.prepareImage(original, parts)
  expect(state.mode.value).toBe('single')
  transport.mockResolvedValue({ items: [{ kind: 'RECOGNITION', remaining: 0 }] })
  await state.start()
  expect(state.feedback.value).toContain('今日剩余0次')
  expect(transport).toHaveBeenCalledTimes(1)
  expect(navigate).not.toHaveBeenCalled()
})
