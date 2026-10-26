<script setup lang="ts">
import type { ExportTaskState } from '#shared/types/tasks'
import { workspaceFeedback } from '~/utils/workspace-feedback'
definePageMeta({ middleware: 'auth', bottomNav: false, alias: '/account/exports/:id' })
useHead({ title: 'Word 导出 · Formula AI' })
const id = String(useRoute().params.id)
const request = useTaskPolling<ExportTaskState>(
  `account-export-${id}`,
  `/api/account/exports/${id}`,
  (task) => ['QUEUED', 'PROCESSING'].includes(task.status),
)
const { data: task, error, refresh, status } = request
const busy = ref(false)
const feedback = ref('')
let requestKey = ''
async function retry() {
  if (busy.value || !task.value) return
  busy.value = true
  feedback.value = ''
  requestKey ||= crypto.randomUUID()
  try {
    const next = await $fetch<ExportTaskState>('/api/account/exports', {
      method: 'POST',
      body: { formulaVersionId: task.value.formulaVersionId, requestKey },
      retry: 0,
      timeout: 20000,
    })
    clearNuxtData('account-usage')
    await navigateTo(`/exports/${next.id}`, { replace: true })
  } catch (error) {
    feedback.value = workspaceFeedback(error)
  } finally {
    busy.value = false
  }
}
await request
</script>
<template>
  <PageHeader
    title="Word 导出"
    :back-to="task?.formulaId ? '/formulas/' + task.formulaId : '/library'"
  />
  <template v-if="task">
    <ExportResult v-if="task.status === 'COMPLETED'" :task="task" />
    <TaskProgress v-else :task="task" :title="task.title" />
    <p class="info-note section">
      导出绑定 v{{ task.versionNumber }}，之后修改公式不会改变本次文档内容。
    </p>
    <a
      v-if="task.downloadUrl && task.status !== 'COMPLETED'"
      :href="task.downloadUrl"
      download
      class="button button-primary button-block section"
    >
      <AppIcon name="download" :size="17" />
      下载 Word 文档
    </a>
    <NuxtLink v-if="task.formulaId" :to="'/formulas/' + task.formulaId" class="text-button section">
      返回公式
    </NuxtLink>
    <button
      v-if="task.status === 'FAILED'"
      class="button button-secondary button-block section"
      :disabled="busy || !!error"
      @click="retry"
    >
      {{ busy ? '正在提交…' : '重新提交导出' }}
    </button>
    <p v-if="task.status === 'FAILED'" class="info-note section">
      可先回到公式库修正 LaTeX；重新提交使用1次新导出额度。
    </p>
  </template>
  <div v-if="error" class="stack section" role="alert">
    <p class="error-text">暂时无法读取导出任务。</p>
    <button class="button button-secondary" :disabled="status === 'pending'" @click="refresh()">
      {{ status === 'pending' ? '正在读取…' : '重新读取任务' }}
    </button>
  </div>
  <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
  <AccountUsage />
</template>
