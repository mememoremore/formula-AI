<script setup lang="ts">
import type { RegionDraft } from '~/utils/preparation-storage'
import { workspaceFeedback } from '~/utils/workspace-feedback'

interface Region {
  index: number
  bbox: number[]
  preview: string
  file: File
  selected: boolean
  manual: boolean
}

const props = defineProps<{
  file: File | null
  ownerId: string
  disabled?: boolean
  prepareOnly?: boolean
  inlinePreparation?: boolean
  initialRegions?: RegionDraft[]
}>()
const emit = defineEmits<{
  busy: [value: boolean]
  prepared: [files: File[]]
  regions: [regions: RegionDraft[]]
}>()
const fetcher = useAccountFetch()
const regions = ref<Region[]>([]),
  busy = ref(false),
  feedback = ref(''),
  editing = ref<number | null>(null)
let disposed = false,
  generation = 0
let controller: AbortController | undefined

function reset() {
  generation++
  controller?.abort()
  for (const region of regions.value)
    if (region.preview.startsWith('blob:')) URL.revokeObjectURL(region.preview)
  regions.value = []
  editing.value = null
  feedback.value = ''
}

watch(
  [() => props.file, () => props.ownerId],
  () => {
    reset()
    regions.value = (props.initialRegions ?? []).map((row) => ({
      ...row,
      file: row.file,
      preview: URL.createObjectURL(row.file),
    }))
  },
  { immediate: true },
)
onScopeDispose(() => {
  disposed = true
  reset()
})

async function detect() {
  if (!props.file || busy.value || props.disabled) return false
  if (regions.value.length) return true
  busy.value = true
  emit('busy', true)
  feedback.value = ''

  const current = generation

  controller = new AbortController()
  try {
    const result = await fetcher<{
      regions: Array<{ index: number; bbox: number[]; imageBase64: string }>
    }>('/api/account/recognitions/regions', {
      method: 'POST',
      body: props.file,
      headers: { 'content-type': props.file.type },
      signal: controller.signal,
      timeout: 70000,
      retry: 0,
    })

    if (disposed || current !== generation) return
    regions.value = result.regions.map((r) => {
      const bytes = Uint8Array.from(atob(r.imageBase64), (c) => c.charCodeAt(0))

      return {
        index: r.index,
        bbox: r.bbox,
        file: new File([bytes], `formula-${r.index + 1}.png`, { type: 'image/png' }),
        preview: 'data:image/png;base64,' + r.imageBase64,
        selected: true,
        manual: false,
      }
    })
    return true
  } catch (error) {
    if (!disposed && current === generation)
      feedback.value = workspaceFeedback(error, '公式区域检测失败，请重新裁剪后重试。')
    return false
  } finally {
    busy.value = false
    emit('busy', false)
  }
}

defineExpose({ detect })

watch(
  () => regions.value.filter((region) => region.selected).map((region) => region.file),
  (files) => {
    if (props.inlinePreparation) emit('prepared', files)
  },
  { flush: 'sync' },
)

watch(
  () =>
    regions.value.map((row) => ({
      index: row.index,
      bbox: [...row.bbox],
      file: row.file,
      selected: row.selected,
      manual: row.manual,
    })),
  (rows) => emit('regions', rows),
  { deep: true },
)

function move(index: number, direction: number) {
  const position = regions.value.findIndex((row) => row.index === index),
    target = position + direction

  if (busy.value || props.disabled || target < 0 || target >= regions.value.length) return

  const [row] = regions.value.splice(position, 1)

  regions.value.splice(target, 0, row!)
}

function remove(index: number) {
  const position = regions.value.findIndex((row) => row.index === index)

  if (busy.value || props.disabled || position < 0) return

  const [row] = regions.value.splice(position, 1)

  if (row?.preview.startsWith('blob:')) URL.revokeObjectURL(row.preview)
}

function cropped(file: File, box?: number[]) {
  if (editing.value === -1) {
    if (regions.value.length >= 20) return
    regions.value.push({
      index: Math.max(-1, ...regions.value.map((row) => row.index)) + 1,
      bbox: box ?? [],
      file,
      preview: URL.createObjectURL(file),
      selected: true,
      manual: true,
    })
    editing.value = null
    return
  }

  const region = regions.value.find((r) => r.index === editing.value)

  if (!region) return
  if (region.preview.startsWith('blob:')) URL.revokeObjectURL(region.preview)
  region.file = file
  region.preview = URL.createObjectURL(file)
  region.manual = true
  if (box) region.bbox = box
  editing.value = null
}

function submit() {
  if (busy.value || props.disabled) return

  const selected = regions.value.filter((region) => region.selected)

  if (!selected.length) return
  if (props.prepareOnly && selected.length < 2) {
    feedback.value = '多公式模式每张图片至少选择两个区域；单公式图片请使用单公式批次。'
    return
  }
  emit(
    'prepared',
    selected.map((region) => region.file),
  )
}
</script>
<template>
  <section class="multi-formulas">
    <p class="info-note">检测后勾选完整公式；可逐个调整裁剪范围。</p>
    <button
      class="button button-secondary button-block"
      :disabled="!file || busy || disabled || regions.length >= 20"
      @click="editing = -1"
    >
      手动裁剪公式区域
    </button>
    <button
      v-if="!regions.length && !inlinePreparation"
      class="button button-primary button-block"
      :disabled="!file || busy || disabled"
      @click="detect"
    >
      {{ busy ? '正在检测公式…' : '自动裁剪公式区域' }}
    </button>
    <template v-if="regions.length">
      <p class="field-label">检测到 {{ regions.length }} 个区域，请检查公式是否完整并勾选</p>
      <article v-for="(region, position) in regions" :key="region.index" class="card multi-region">
        <label>
          <input v-model="region.selected" type="checkbox" :disabled="busy || disabled" />
          公式 {{ position + 1 }}{{ region.manual ? ' · 已手动调整' : '' }}
        </label>
        <img :src="region.preview" :alt="'公式 ' + (region.index + 1) + ' 裁剪预览'" />
        <button class="text-button" :disabled="busy || disabled" @click="editing = region.index">
          手动裁剪
        </button>
        <div class="row">
          <button
            class="text-button"
            :disabled="busy || disabled || position === 0"
            @click="move(region.index, -1)"
          >
            上移
          </button>
          <button
            class="text-button"
            :disabled="busy || disabled || position === regions.length - 1"
            @click="move(region.index, 1)"
          >
            下移
          </button>
          <button class="text-button" :disabled="busy || disabled" @click="remove(region.index)">
            移除区域
          </button>
        </div>
      </article>
      <button
        v-if="!inlinePreparation"
        class="button button-primary button-block"
        :disabled="
          busy ||
          disabled ||
          (prepareOnly
            ? regions.filter((r) => r.selected).length < 2
            : !regions.some((r) => r.selected))
        "
        @click="submit"
      >
        {{ prepareOnly ? '确认这张图片的公式区域' : '识别勾选的公式' }}
      </button>
      <p v-if="prepareOnly && regions.filter((r) => r.selected).length < 2" class="info-note">
        多公式模式每张图片至少勾选两个公式区域。
      </p>
    </template>
    <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
    <FormulaImageCropper
      v-if="editing !== null && file"
      :file="file"
      :initial-box="regions.find((r) => r.index === editing)?.bbox"
      :allow-rotate="false"
      @close="editing = null"
      @selected="cropped"
    />
  </section>
</template>
<style scoped>
.multi-formulas {
  display: grid;
  gap: 14px;
}
.multi-region {
  padding: 14px;
  display: grid;
  gap: 10px;
}
.multi-region img {
  width: 100%;
  max-height: 180px;
  object-fit: contain;
  background: white;
}
.multi-region label {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
