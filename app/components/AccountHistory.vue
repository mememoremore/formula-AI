<script setup lang="ts">
import type { RecognitionHistoryItem, RecognitionHistoryPage } from '#shared/types/tasks'
import { workspaceFeedback } from '~/utils/workspace-feedback'
const request = useTaskPolling<RecognitionHistoryPage>(
  'account-history',
  '/api/account/recognitions',
  (page) => page.items.some((item) => ['QUEUED', 'PROCESSING'].includes(item.status)),
)
const { data: page, error, refresh } = request
const items = ref<RecognitionHistoryItem[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false),
  feedback = ref('')
let loadedBeyondFirst = false
const labels = { QUEUED: '排队中', PROCESSING: '识别中', COMPLETED: '已完成', FAILED: '识别失败' }
watch(
  page,
  (value) => {
    if (!value) {
      items.value = []
      cursor.value = null
      return
    }
    const ids = new Set(value.items.map((item) => item.id))
    items.value = [...value.items, ...items.value.filter((item) => !ids.has(item.id))]
    if (!loadedBeyondFirst) cursor.value = value.nextCursor
  },
  { immediate: true },
)
async function reload() {
  loadedBeyondFirst = false
  items.value = []
  await refresh()
}
async function more() {
  if (!cursor.value || loading.value) return
  loading.value = true
  feedback.value = ''
  try {
    const value = await $fetch<RecognitionHistoryPage>('/api/account/recognitions', {
      query: { cursor: cursor.value },
      retry: 0,
      timeout: 15000,
    })
    const ids = new Set(items.value.map((item) => item.id))
    items.value.push(...value.items.filter((item) => !ids.has(item.id)))
    cursor.value = value.nextCursor
    loadedBeyondFirst = true
  } catch (error) {
    feedback.value = workspaceFeedback(error, '加载失败，已显示的记录会保留。')
  } finally {
    loading.value = false
  }
}
await request
</script>
<template>
  <div class="section-heading">
    <h2>每一次识别，都有迹可循</h2>
    <button class="text-button" @click="reload">刷新</button>
  </div>
  <div v-if="error" class="status-panel card" role="alert">
    <p>暂时无法读取识别记录。</p>
    <button class="text-button" @click="reload">重新加载</button>
  </div>
  <div v-else-if="items.length" class="stack">
    <NuxtLink
      v-for="item in items"
      :key="item.id"
      :to="
        item.formulaId && item.status === 'COMPLETED'
          ? '/formulas/' + item.formulaId
          : '/recognitions/' + item.id
      "
      class="card history-item"
    >
      <div class="row between">
        <h3>{{ item.title }}</h3>
        <AppIcon name="chevron" :size="16" />
      </div>
      <MathFormula v-if="item.latex" :latex="item.latex" :display="false" />
      <p v-if="item.status === 'FAILED'" class="error-text">
        {{ item.errorMessage || '请打开任务查看原因并重试。' }}
      </p>
      <div class="history-meta">
        <span :class="{ failed: item.status === 'FAILED' }">{{ labels[item.status] }}</span>
        <span>{{ item.createdAt.slice(0, 10) }}</span>
      </div>
    </NuxtLink>
    <button v-if="cursor" class="button button-secondary" :disabled="loading" @click="more">
      {{ loading ? '正在加载…' : '加载更多' }}
    </button>
  </div>
  <EmptyState
    v-else
    title="等待第一张公式图片"
    description="识别中的任务、完成结果与失败记录都会留在这里。"
    action-label="上传公式图片"
    action-to="/upload"
  />
  <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
</template>
<style scoped>
.history-item {
  display: block;
  padding: 22px;
}
h3 {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.history-item :deep(.math-formula) {
  margin-top: 15px;
}
.history-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: var(--color-muted);
  margin-top: 16px;
}
.history-meta > span:first-child {
  color: #8b75ba;
}
.history-meta > span.failed {
  color: var(--color-danger);
}
.history-item .error-text {
  margin-top: 14px;
}
</style>
