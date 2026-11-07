<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'
import type { ExportTaskState } from '#shared/types/tasks'
import { workspaceFeedback } from '~/utils/workspace-feedback'
import { usageInvalidated } from '~/utils/account-cache'

const accountFetch = useAccountFetch()
const props = defineProps<{ formula: SavedFormula }>()
const busy = ref(false),
  open = ref(false),
  feedback = ref('')
const version = computed(() => props.formula.versions.at(-1))
let requestKey = '',
  controller: AbortController | undefined,
  disposed = false

watch(version, () => {
  requestKey = ''
  feedback.value = ''
})

function show() {
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
    const task = await accountFetch<ExportTaskState>('/api/account/exports', {
      method: 'POST',
      body: { formulaVersionId: versionId, requestKey },
      retry: 0,
      timeout: 20_000,
      signal: controller.signal,
    })

    if (disposed) return
    clearNuxtData(usageInvalidated)
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
      <div v-if="version" class="export-preview">
        <p class="field-label">当前公式</p>
        <MathFormula :latex="version.latex" tabindex="0" aria-label="导出公式预览，可横向滚动" />
      </div>
      <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
      <button class="button button-primary" type="submit" :disabled="busy || !version">
        {{ busy ? '正在提交…' : '生成 Word 文档' }}
      </button>
      <p class="info-note">导出原生可编辑公式，并附上公式 LaTeX。未保存的编辑草稿不会导出。</p>
    </form>
    <WordUseGuide />
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
