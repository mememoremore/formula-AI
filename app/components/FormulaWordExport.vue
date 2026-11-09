<script setup lang="ts">
import { workspaceFeedback } from '~/utils/workspace-feedback'
import { usageInvalidated } from '~/utils/account-cache'

const props = defineProps<{
  formulas: Array<{ id: string; latex: string; label?: string }>
  preselected?: boolean
}>()
const fetcher = useAccountFetch(),
  open = ref(false),
  step = ref<'select' | 'format' | 'mode'>('select'),
  selected = ref<number[]>([]),
  format = ref<'image' | 'editable'>('editable'),
  busy = ref(false),
  error = ref(''),
  existingInput = ref<HTMLInputElement>()

function show() {
  selected.value = props.preselected ? props.formulas.map((_, i) => i) : []
  step.value = props.preselected ? 'format' : 'select'
  error.value = ''
  open.value = true
}

function chooseFormat(value: 'image' | 'editable') {
  format.value = value
  step.value = 'mode'
}

watch(
  () => props.formulas.map((f) => f.id + ':' + f.latex).join('|'),
  () => {
    if (!busy.value) open.value = false
  },
)

async function submit(file?: File) {
  if (busy.value || !selected.value.length) return
  if (file && (!/\.docx$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024)) {
    error.value = '请选择不超过5MB的 DOCX 文档。'
    return
  }
  busy.value = true
  error.value = ''

  const snapshot = [...selected.value].sort((a, b) => a - b).map((i) => props.formulas[i]!)

  try {
    let existingDocx: string | undefined

    if (file) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let raw = ''

      for (let i = 0; i < bytes.length; i += 8192)
        raw += String.fromCharCode(...bytes.subarray(i, i + 8192))
      existingDocx = btoa(raw)
    }
    if (
      snapshot.some(
        (f) => !props.formulas.some((current) => current.id === f.id && current.latex === f.latex),
      )
    )
      throw new Error('公式已变更，请重新选择。')

    const blob = await fetcher<Blob>('/api/account/exports/document', {
      method: 'POST',
      body: { versionIds: snapshot.map((f) => f.id), format: format.value, existingDocx },
      responseType: 'blob',
      retry: 0,
      timeout: 120000,
    })
    const url = URL.createObjectURL(blob),
      link = document.createElement('a')

    link.href = url
    link.download = file ? file.name.replace(/\.docx$/i, '-墨析.docx') : '墨析公式.docx'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    clearNuxtData(usageInvalidated)
    open.value = false
  } catch (cause) {
    error.value = workspaceFeedback(cause, 'Word 导出失败，请重试。')
  } finally {
    busy.value = false
  }
}

function append(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  input.value = ''
  if (file) void submit(file)
}
</script>
<template>
  <button class="button button-white" :disabled="!formulas.length" @click="show">
    <AppIcon name="download" :size="16" />
    导出 Word
  </button>
  <AppModal
    :open="open"
    :title="
      step === 'select' ? '选择要导出的公式' : step === 'format' ? '选择公式格式' : '选择导出方式'
    "
    @close="!busy && (open = false)"
  >
    <div class="stack" :aria-busy="busy">
      <template v-if="step === 'select'">
        <label v-for="(formula, index) in formulas" :key="formula.id" class="formula-option">
          <input
            v-model="selected"
            type="checkbox"
            :value="index"
            :aria-label="'选择公式 ' + (index + 1)"
          />
          <span>
            <MathFormula :latex="formula.latex" />
          </span>
        </label>
        <button class="button button-primary" :disabled="!selected.length" @click="step = 'format'">
          确认选择
        </button>
      </template>
      <template v-else-if="step === 'format'">
        <button class="button button-primary" @click="chooseFormat('editable')">
          可编辑公式版
        </button>
        <button class="button button-secondary" @click="chooseFormat('image')">公式图片版</button>
        <p class="info-note">两种格式都只包含你选择的公式。</p>
      </template>
      <template v-else>
        <button class="button button-primary" :disabled="busy" @click="submit()">
          {{ busy ? '正在生成 Word…' : '新建 Word 文档' }}
        </button>
        <button class="button button-secondary" :disabled="busy" @click="existingInput?.click()">
          追加到已有 Word
        </button>
        <input
          ref="existingInput"
          class="sr-only"
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          @change="append"
        />
        <p class="info-note">
          保留原文档内容，在末尾加入所选公式，下载为新文件；原文件不会被覆盖。
        </p>
      </template>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    </div>
  </AppModal>
</template>
<style scoped>
.formula-option {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  min-width: 0;
}
.formula-option > span {
  flex: 1;
  min-width: 0;
}
</style>
