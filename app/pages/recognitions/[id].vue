<script setup lang="ts">
import type { RecognitionTaskState } from '#shared/types/tasks'
import { workspaceFeedback } from '~/utils/workspace-feedback'
definePageMeta({ middleware: 'auth', bottomNav: false, alias: '/account/tasks/:id' })
useHead({ title: '识别任务 · Formula AI' })
const id = String(useRoute().params.id)
const request = useTaskPolling<RecognitionTaskState>(
  `account-task-${id}`,
  `/api/account/tasks/${id}`,
  (task) => ['QUEUED', 'PROCESSING'].includes(task.status),
)
const { data: task, error, refresh, status } = request
const submitting = ref(false)
const feedback = ref('')
let requestKey = ''
watch(
  task,
  (value) => {
    if (import.meta.client && value?.status === 'COMPLETED' && value.formulaId) {
      clearNuxtData(
        (key) =>
          key.startsWith('account-library-') ||
          ['account-overview', 'account-history', 'account-categories'].includes(key),
      )
      void navigateTo(`/formulas/${value.formulaId}`, { replace: true })
    }
  },
  { immediate: true },
)
async function retry() {
  if (!task.value || submitting.value) return
  submitting.value = true
  feedback.value = ''
  requestKey ||= crypto.randomUUID()
  try {
    const next = await $fetch<RecognitionTaskState>('/api/account/recognitions', {
      method: 'POST',
      body: { fileId: task.value.fileId, mode: task.value.mode, requestKey },
      retry: 0,
      timeout: 20000,
    })
    clearNuxtData('account-usage')
    await navigateTo(`/recognitions/${next.id}`, { replace: true })
  } catch (error) {
    feedback.value = workspaceFeedback(error)
  } finally {
    submitting.value = false
  }
}
await request
</script>
<template>
  <PageHeader title="识别任务" back-to="/library?view=recent" />
  <TaskProgress v-if="task" :task="task" title="公式识别" />
  <RecognitionSteps v-if="task" :status="task.status" />
  <p class="info-note section">任务保存在账号，刷新后可以继续查看。识别完成后请核对公式内容。</p>
  <div v-if="error" class="stack section" role="alert">
    <p class="error-text">任务暂时无法读取，请重试或重新登录。</p>
    <button class="button button-secondary" :disabled="status === 'pending'" @click="refresh()">
      {{ status === 'pending' ? '正在读取…' : '重新读取任务' }}
    </button>
  </div>
  <button
    v-if="task?.status === 'FAILED'"
    class="button button-primary button-block section"
    :disabled="submitting || !!error"
    @click="retry"
  >
    {{ submitting ? '正在提交…' : '重新提交识别' }}
  </button>
  <p v-if="task?.status === 'FAILED'" class="info-note section">重新提交会使用1次新的识别额度。</p>
  <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
  <AccountUsage />
</template>
