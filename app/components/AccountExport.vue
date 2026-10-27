<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'
import type { ExportTaskState } from '#shared/types/tasks'
import { workspaceFeedback } from '~/utils/workspace-feedback'
const props = defineProps<{ formula: SavedFormula }>()
const selected = ref(props.formula.versions.at(-1)?.id ?? '')
const busy = ref(false),
  open = ref(false),
  feedback = ref('')
const version = computed(() => props.formula.versions.find((v) => v.id === selected.value))
let requestKey = '',
  controller: AbortController | undefined,
  disposed = false
watch(selected, () => {
  requestKey = ''
  feedback.value = ''
})
watch(
  () => props.formula.versions.at(-1)?.id,
  (id) => {
    if (!open.value) selected.value = id ?? ''
  },
)
function show() {
  selected.value = props.formula.versions.at(-1)?.id ?? ''
  feedback.value = ''
  open.value = true
}
async function submit() {
  if (busy.value || !version.value) return
  busy.value = true
  feedback.value = ''
  requestKey ||= crypto.randomUUID()
  const versionId = version.value.id
  controller = new AbortController()
  try {
    const task = await $fetch<ExportTaskState>('/api/account/exports', {
      method: 'POST',
      body: { formulaVersionId: versionId, requestKey },
      retry: 0,
      timeout: 20_000,
      signal: controller.signal,
    })
    if (disposed) return
    clearNuxtData('account-usage')
    await navigateTo(`/exports/${task.id}`)
  } catch (error) {
    if (!disposed)
      feedback.value = workspaceFeedback(
        error,
        '导出任务暂时无法提交，请重试；已保存公式不受影响。',
      )
  } finally {
    if (!disposed) busy.value = false
  }
}
onScopeDispose(() => {
  disposed = true
  controller?.abort()
})
</script>
<template>
  <button class="button button-white button-block export-trigger" @click="show">
    <AppIcon name="download" :size="18" />
    导出 Word
  </button>
  <AppModal :open="open" title="导出可编辑 Word" @close="!busy && (open = false)">
    <form class="stack" :aria-busy="busy" @submit.prevent="submit">
      <label>
        <span class="field-label">选择导出的公式版本</span>
        <select v-model="selected" class="input" :disabled="busy">
          <option v-for="item in formula.versions.toReversed()" :key="item.id" :value="item.id">
            v{{ item.number }} ·
            {{
              item.origin === 'RECOGNITION'
                ? '原始识别'
                : item.origin === 'DEMO'
                  ? '模拟示例'
                  : '人工修订'
            }}
          </option>
        </select>
      </label>
      <div v-if="version" class="export-preview">
        <p class="field-label">将导出 v{{ version.number }} 的已保存内容</p>
        <MathFormula :latex="version.latex" tabindex="0" aria-label="导出版本预览，可横向滚动" />
      </div>
      <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
      <button class="button button-primary" type="submit" :disabled="busy || !version">
        {{ busy ? '正在提交…' : '生成 Word 文档' }}
      </button>
      <p class="info-note">
        导出原生可编辑公式，并附上所选版本的 LaTeX。未保存的编辑草稿不会导出。
      </p>
    </form>
  </AppModal>
</template>
<style scoped>
.export-trigger {
  margin-top: 12px;
}
.export-preview {
  min-width: 0;
  padding: 16px;
  border-radius: var(--radius-control);
  background: var(--color-background);
}
</style>
