<script setup lang="ts">
import type { UsageOverview } from '#shared/types/tasks'
const props = defineProps<{ ownerId?: string }>()
const {
  data: usage,
  error,
  refresh,
} = useFetch<UsageOverview>('/api/account/usage', {
  key: computed(() => (props.ownerId ? 'account-usage-' + props.ownerId : 'account-usage')),
  getCachedData: (key, app) => (app.isHydrating ? app.payload.data[key] : undefined),
})
const labels = { RECOGNITION: '识别', CHAT: 'AI 提问与解释', EXPORT: '导出' }
</script>
<template>
  <section class="usage-summary section">
    <div class="section-heading">
      <h2>今日可用次数</h2>
      <button v-if="error" class="text-button" @click="refresh()">重新读取</button>
    </div>
    <div v-if="usage && !error" class="usage-grid">
      <div v-for="item in usage.items" :key="item.kind">
        <strong>
          {{ item.remaining }}
          <small>/ {{ item.limit }}</small>
        </strong>
        <span>{{ labels[item.kind] }}</span>
      </div>
    </div>
    <p v-else class="info-note">{{ error ? '暂时无法读取可用次数。' : '正在读取可用次数…' }}</p>
    <p class="info-note usage-note">每天北京时间 08:00 重置；自动重试不重复计数。</p>
  </section>
</template>
<style scoped>
.usage-summary h2 {
  font-size: 13px;
  color: #766b88;
}
.usage-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.usage-grid > div {
  padding: 14px 8px;
  background: #f0edf8;
  border-radius: 13px;
  text-align: center;
}
.usage-grid strong {
  display: block;
  font-size: 19px;
  font-weight: 500;
  color: #8a71b8;
}
.usage-grid small {
  font-size: 10px;
  color: #aca0bd;
}
.usage-grid span {
  font-size: 10px;
  color: #a196af;
}
.usage-note {
  font-size: 10px;
  margin-top: 9px;
}
</style>
