<script setup lang="ts">
import type { ServiceStatusResponse } from '#shared/types/services'
const { data, status, error, execute } = useFetch<ServiceStatusResponse>(
  '/api/account/service-status',
  { key: 'account-service-status', immediate: false, watch: false, timeout: 12000, retry: 0 },
)
function opened(event: Event) {
  if ((event.target as HTMLDetailsElement).open && status.value === 'idle') void execute()
}
const labels = { ready: '已连接', configured: '已配置', demo: '模拟模式', unavailable: '暂不可用' }
</script>
<template>
  <details class="card service-status section" @toggle="opened">
    <summary>
      <span>服务状态</span>
      <AppIcon name="chevron" :size="17" />
    </summary>
    <p v-if="status === 'pending'" class="info-note section" role="status">正在检查连接…</p>
    <p v-else-if="error" class="error-text section" role="alert">暂时无法检查服务状态。</p>
    <dl v-else-if="data">
      <div v-for="item in data.items" :key="item.id" class="service-row">
        <dt>{{ item.name }}</dt>
        <dd>
          <span class="service-state" :class="item.state">{{ labels[item.state] }}</span>
          <p>{{ item.detail }}</p>
        </dd>
      </div>
    </dl>
    <div v-if="status !== 'idle'" class="row between section">
      <span class="info-note">
        {{
          data
            ? '检查于 ' +
              new Date(data.checkedAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' })
            : ''
        }}
      </span>
      <button class="text-button" :disabled="status === 'pending'" @click="execute()">
        重新检查
      </button>
    </div>
  </details>
</template>
<style scoped>
.service-status {
  padding: 22px;
}
summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  list-style: none;
  font-size: 14px;
}
summary::-webkit-details-marker {
  display: none;
}
dl {
  margin: 18px 0 0;
}
.service-row {
  display: grid;
  grid-template-columns: 78px 1fr;
  gap: 12px;
  padding: 15px 0;
  font-size: 13px;
}
.service-row + .service-row {
  border-top: 1px solid var(--color-border);
}
dd {
  margin: 0;
  text-align: right;
}
dd p {
  font-size: 11px;
  color: var(--color-muted);
  line-height: 1.8;
  margin-top: 7px;
}
.service-state {
  font-size: 12px;
  color: #7f6aa4;
}
.service-state.ready {
  color: #5c8c77;
}
.service-state.unavailable {
  color: var(--color-danger);
}
</style>
