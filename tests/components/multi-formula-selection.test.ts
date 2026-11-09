import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { ref, watch, onScopeDispose, defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import MultiFormulaSelection from '../../app/components/MultiFormulaSelection.vue'
import type { RegionDraft } from '../../app/utils/preparation-storage'

const fetcher = vi.fn()
const file = new File(['image'], 'original.png', { type: 'image/png' })
const Cropper = defineComponent({
  name: 'FormulaImageCropper',
  props: ['file', 'initialBox', 'allowRotate'],
  emits: ['selected', 'close'],
  setup() {
    return () => h('div')
  },
})
function selection() {
  return mount(MultiFormulaSelection, {
    props: { file, ownerId: 'owner', prepareOnly: true, inlinePreparation: true },
    global: { stubs: { FormulaImageCropper: Cropper } },
  })
}
const response = {
  regions: [0, 1].map((index) => ({
    index,
    bbox: [0, index * 50, 100, (index + 1) * 50],
    imageBase64: 'aW1hZ2U=',
  })),
}
beforeEach(() => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('onScopeDispose', onScopeDispose)
  vi.stubGlobal('useAccountFetch', () => fetcher)
  fetcher.mockReset().mockResolvedValue(response)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:adjusted')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('一键入口检测后直接输出全部区域，无逐图检测或确认按钮，勾选立即更新', async () => {
  const wrapper = selection()
  expect(wrapper.text()).not.toContain('检测公式区域')
  expect(await wrapper.vm.detect()).toBe(true)
  await flushPromises()
  expect(wrapper.findAll('.multi-region')).toHaveLength(2)
  expect(wrapper.text()).not.toContain('确认这张图片')
  expect(wrapper.emitted('prepared')?.at(-1)?.[0]).toHaveLength(2)
  await wrapper.findAll('input[type=checkbox]')[0]!.setValue(false)
  expect(wrapper.emitted('prepared')?.at(-1)?.[0]).toHaveLength(1)
})

test('手动调整替换选中区域，继续一键检测不会覆盖已调整结果', async () => {
  const wrapper = selection()
  await wrapper.vm.detect()
  await flushPromises()
  await wrapper.find('.multi-region button').trigger('click')
  const cropped = new File(['adjusted'], 'adjusted.png', { type: 'image/png' })
  wrapper.findComponent(Cropper).vm.$emit('selected', cropped, [1, 2, 30, 40])
  await flushPromises()
  const files = wrapper.emitted('prepared')?.at(-1)?.[0] as File[]
  expect(files[0]?.name).toBe('adjusted.png')
  expect(await wrapper.vm.detect()).toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect((wrapper.emitted('prepared')?.at(-1)?.[0] as File[])[0]?.name).toBe('adjusted.png')
})

test('检测失败可重试，切换图片后晚到的结果被丢弃', async () => {
  const wrapper = selection()
  fetcher.mockRejectedValueOnce(new Error('unavailable'))
  expect(await wrapper.vm.detect()).toBe(false)
  expect(await wrapper.vm.detect()).toBe(true)
  await wrapper.setProps({ file: new File(['new'], 'new.png') })
  let resolve!: (value: typeof response) => void
  fetcher.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const pending = wrapper.vm.detect()
  await wrapper.setProps({ file: new File(['third'], 'third.png') })
  resolve(response)
  await pending
  await flushPromises()
  expect(wrapper.findAll('.multi-region')).toHaveLength(0)
})

test('任意位置手动添加、排序、移除及恢复保留区域字节和边框', async () => {
  const wrapper = selection()
  const buttons = () => wrapper.findAll('button')
  await buttons()
    .find((button) => button.text() === '手动裁剪公式区域')!
    .trigger('click')
  const first = new File(['left'], 'left.png', { type: 'image/png' })
  wrapper.findComponent(Cropper).vm.$emit('selected', first, [10, 30, 90, 100])
  await flushPromises()
  await buttons()
    .find((button) => button.text() === '手动裁剪公式区域')!
    .trigger('click')
  const second = new File(['right'], 'right.png', { type: 'image/png' })
  wrapper.findComponent(Cropper).vm.$emit('selected', second, [300, 10, 500, 90])
  await flushPromises()
  expect(fetcher).not.toHaveBeenCalled()
  await wrapper
    .findAll('.multi-region')[1]!
    .findAll('button')
    .find((button) => button.text() === '上移')!
    .trigger('click')
  const saved = wrapper.emitted('regions')!.at(-1)![0] as RegionDraft[]
  expect(saved.map((row) => row.file.name)).toEqual(['right.png', 'left.png'])
  expect(saved[0]?.bbox).toEqual([300, 10, 500, 90])
  const recovered = mount(MultiFormulaSelection, {
    props: { file, ownerId: 'owner', initialRegions: saved, inlinePreparation: true },
    global: { stubs: { FormulaImageCropper: Cropper } },
  })
  expect(recovered.findAll('.multi-region')).toHaveLength(2)
  await recovered
    .findAll('.multi-region')[0]!
    .findAll('button')
    .find((button) => button.text() === '移除区域')!
    .trigger('click')
  expect((recovered.emitted('prepared')!.at(-1)![0] as File[]).map((row) => row.name)).toEqual([
    'left.png',
  ])
  wrapper.unmount()
  recovered.unmount()
})
