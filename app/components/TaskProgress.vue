<script setup lang="ts">
import type { TaskState } from '#shared/types/tasks'
const props = defineProps<{ task: TaskState; title: string; compact?: boolean }>()
const labels = {
  QUEUED: '正在排队',
  PROCESSING: '正在处理',
  COMPLETED: '处理完成',
  FAILED: '暂时未能完成',
}
const waiting = computed(() => ['QUEUED', 'PROCESSING'].includes(props.task.status))
</script>
<template>
  <section class="task-progress" :class="{ failed: task.status === 'FAILED' }" aria-live="polite">
    <PaperArtwork v-if="!compact" />
    <span class="task-ring" :class="{ waiting }">
      <AppIcon
        :name="
          task.status === 'COMPLETED' ? 'check' : task.status === 'FAILED' ? 'info' : 'sparkles'
        "
        :size="29"
      />
    </span>
    <h2>{{ labels[task.status] }}</h2>
    <p class="task-title">{{ title }}</p>
    <p v-if="!waiting" class="info-note">
      {{
        task.status === 'COMPLETED'
          ? '结果已保存在你的账号。'
          : '已保留原始资料，可检查原因后重试。'
      }}
    </p>
    <p v-if="task.errorMessage" :class="task.status === 'FAILED' ? 'error-text' : 'info-note'">
      {{ task.errorMessage }}
    </p>
  </section>
</template>
<style scoped>
.task-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 11px;
  text-align: center;
  padding: 2px 12px 18px;
}
.task-ring {
  position: relative;
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  border: 5px solid #eee9fb;
  border-top-color: #8c70e5;
  border-radius: 50%;
  color: var(--color-primary);
  margin: 0 0 4px;
  background: linear-gradient(145deg, #fff, #fbf9ff);
}
.task-title {
  color: #887b9f;
  font-size: 14px;
  line-height: 1.8;
}
h2 {
  font-size: 24px;
  line-height: 1.35;
}
p {
  max-width: 100%;
  overflow-wrap: anywhere;
}
.failed .task-ring {
  border-top-color: #c87c8d;
  color: var(--color-danger);
}
.waiting::after {
  content: '';
  position: absolute;
  inset: -5px;
  border: 5px solid transparent;
  border-top-color: #8c70e5;
  border-radius: 50%;
  animation: spin 1.5s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
