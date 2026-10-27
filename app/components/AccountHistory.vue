<script setup lang="ts">
const props = defineProps<{ ownerId: string }>()
const {
  request,
  items,
  loadingMore: loading,
  feedback,
  more,
  reload,
} = useAccountHistory(props.ownerId)
const { error, status } = request
const cursor = computed(() => request.data.value?.nextCursor ?? null)
const labels = { QUEUED: '排队中', PROCESSING: '识别中', COMPLETED: '已完成', FAILED: '识别失败' }
await request
</script>
<template>
  <div class="section-heading">
    <h2>每一次识别，都有迹可循</h2>
    <button class="text-button" :disabled="loading || status === 'pending'" @click="reload">
      刷新
    </button>
  </div>
  <div v-if="status === 'pending' && !items.length" class="card status-panel" role="status">
    正在读取识别记录…
  </div>
  <div v-if="error" class="status-panel card" role="alert">
    <p>暂时无法读取识别记录。</p>
    <button class="text-button" :disabled="status === 'pending' || loading" @click="reload">
      重新加载
    </button>
  </div>
  <LibraryGrid v-if="items.length">
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
  </LibraryGrid>
  <button
    v-if="cursor"
    class="button button-secondary button-block section"
    :disabled="loading || status === 'pending'"
    @click="more"
  >
    {{ loading ? '正在加载…' : '加载更多' }}
  </button>
  <EmptyState
    v-if="!items.length && !error && status !== 'pending'"
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
