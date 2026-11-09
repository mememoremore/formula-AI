<script setup lang="ts">
import { displayFormulaTitle } from '#shared/formula-title'
import { workspaceFeedback } from '~/utils/workspace-feedback'

definePageMeta({ middleware: 'auth', contentWidth: 'reading' })
useHead({ title: '任务中心 · 墨析' })

const session = await useAccountSession(),
  owner = session.data.value?.user?.id,
  fetcher = useAccountFetch()

interface Task {
  id: string
  kind: string
  title: string
  status: string
  createdAt: string
  error: string | null
  to: string
}

const request = await useAsyncData('tasks:' + owner, async () => {
  const data = await fetcher<{ active: number; items: Task[] }>('/api/account/tasks', {
    headers: { 'x-account-id': owner ?? '' },
    retry: 0,
  })

  if (session.data.value?.user?.id !== owner) throw new Error('账号已变化，请刷新页面。')
  return data
})
const onlyActive = ref(false),
  feedback = ref(''),
  stopTarget = ref<Task | null>(null),
  stopping = ref(false)
const active = (status: string) => ['RUNNING', 'PAUSED', 'QUEUED', 'PROCESSING'].includes(status)
const items = computed(
  () =>
    request.data.value?.items
      .slice(0, 20)
      .filter((row) => !onlyActive.value || active(row.status)) ?? [],
)
const labels: Record<string, string> = {
  RUNNING: '处理中',
  PAUSED: '需继续处理',
  QUEUED: '排队中',
  PROCESSING: '处理中',
  COMPLETED: '已完成',
  FAILED: '失败',
  CANCELLED: '已停止',
}
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void request.refresh()
  }, 10000)
})
onScopeDispose(() => clearInterval(timer))

async function refresh() {
  try {
    await request.refresh()
    feedback.value = ''
  } catch (error) {
    feedback.value = workspaceFeedback(error, '任务状态暂时无法更新。')
  }
}

async function stopTask() {
  if (!stopTarget.value || stopping.value) return
  stopping.value = true
  feedback.value = ''
  try {
    await fetcher('/api/account/tasks/' + stopTarget.value.id + '/stop', {
      method: 'POST',
      body: { kind: stopTarget.value.kind },
      headers: { 'x-account-id': owner ?? '' },
      retry: 0,
    })
    stopTarget.value = null
    clearNuxtData(
      (key) =>
        key.startsWith('recognition-batch-') ||
        key.startsWith('account-history') ||
        key === 'account-overview',
    )
    await request.refresh()
  } catch (error) {
    feedback.value = workspaceFeedback(error, '停止结果尚未确认，请刷新任务状态后核对。')
  } finally {
    stopping.value = false
  }
}
</script>
<template>
  <PageHeader title="任务中心" back-to="/profile" />
  <p class="info-note" aria-live="polite">
    {{ request.data.value?.active ?? 0 }}项待处理；离开此页不会停止已经提交的后台任务。
  </p>
  <div class="task-filters section">
    <label>
      <input v-model="onlyActive" type="checkbox" />
      只看待处理
    </label>
    <button class="text-button" @click="refresh">刷新状态</button>
  </div>
  <p v-if="request.error.value" class="error-text">暂时无法读取任务，请刷新重试。</p>
  <div class="stack section">
    <article v-for="row in items" :key="row.kind + row.id" class="card task-row">
      <NuxtLink :to="row.to" class="row task-link">
        <strong>{{ displayFormulaTitle(row.title) }}</strong>
        <span>
          {{ row.error?.startsWith('已停止') ? '已停止' : (labels[row.status] ?? row.status) }}
        </span>
      </NuxtLink>
      <div class="task-time-row">
        <small>{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</small>
        <button
          v-if="active(row.status)"
          class="text-button"
          :disabled="stopping"
          @click="stopTarget = row"
        >
          停止任务
        </button>
      </div>
      <p v-if="row.error && !row.error.startsWith('已停止')" class="error-text">{{ row.error }}</p>
    </article>
  </div>
  <EmptyState v-if="request.data.value && !items.length" title="暂无匹配的任务" />
  <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
  <AppModal :open="!!stopTarget" title="停止任务" @close="!stopping && (stopTarget = null)">
    <div class="stack">
      <p>停止后不再继续处理未完成项，已经生成的公式和结果保留；已使用的额度不返还。</p>
      <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
      <button class="button button-primary" :disabled="stopping" @click="stopTask">
        {{ stopping ? '正在停止…' : '确认停止' }}
      </button>
    </div>
  </AppModal>
</template>
<style scoped>
.task-filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-inline: 16px;
}
.task-filters label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.task-row {
  padding: 16px;
  font-size: 14px;
}
.task-row .row {
  justify-content: space-between;
  flex-wrap: wrap;
}
.task-link {
  display: flex;
  color: inherit;
  text-decoration: none;
}
.task-time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
}
.task-time-row small {
  margin-top: 0;
}
.task-time-row .text-button {
  font-size: 12px;
}
small {
  display: block;
  color: var(--color-text-secondary);
  margin-top: 10px;
}
</style>
