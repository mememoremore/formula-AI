<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'
import type { ExportTaskState } from '#shared/types/tasks'
import { workspaceFeedback } from '~/utils/workspace-feedback'
const props = defineProps<{ formula: SavedFormula }>()
const selected = ref(props.formula.versions.at(-1)?.id ?? '')
const busy = ref(false)
const open = ref(false)
const feedback = ref('')
let requestKey = ''
watch(selected, () => {
  requestKey = ''
  feedback.value = ''
})
watch(
  () => props.formula.versions.at(-1)?.id,
  (id) => {
    selected.value = id ?? ''
  },
)
async function submit() {
  if (busy.value || !selected.value) return
  busy.value = true
  feedback.value = ''
  requestKey ||= crypto.randomUUID()
  try {
    const task = await $fetch<ExportTaskState>('/api/account/exports', {
      method: 'POST',
      body: { formulaVersionId: selected.value, requestKey },
      retry: 0,
      timeout: 20000,
    })
    clearNuxtData('account-usage')
    await navigateTo(`/exports/${task.id}`)
  } catch (error) {
    feedback.value = workspaceFeedback(error)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <button class="button button-white button-block export-trigger" @click="open = true">
    <AppIcon name="download" :size="18" />
    导出 Word
  </button>
  <AppModal :open="open" title="导出可编辑 Word" @close="!busy && (open = false)">
    <form class="stack" @submit.prevent="submit">
      <label>
        <span class="field-label">选择导出的公式版本</span>
        <select v-model="selected" class="input" :disabled="busy">
          <option
            v-for="version in formula.versions.toReversed()"
            :key="version.id"
            :value="version.id"
          >
            v{{ version.number }} · {{ version.number === 1 ? '原始识别' : '人工修订' }}
          </option>
        </select>
      </label>
      <button class="button button-primary" type="submit" :disabled="busy">
        {{ busy ? '正在提交…' : '生成 Word 文档' }}
      </button>
      <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
      <p class="info-note">导出原生可编辑公式，并附上所选版本的 LaTeX 源码。</p>
    </form>
  </AppModal>
</template>
<style scoped>
.export-trigger {
  margin-top: 12px;
}
.export-section h2 {
  font-size: 14px;
}
.export-section > .section-heading svg {
  color: #a18abf;
}
</style>
