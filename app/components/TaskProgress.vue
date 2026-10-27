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
    <p class="info-note">
      {{
        waiting
          ? '任务已保存，可稍后回来继续查看。'
          : task.status === 'COMPLETED'
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
  gap: 18px;
  text-align: center;
  padding: 4px 12px 24px;
}
.task-ring {
  position: relative;
  display: grid;
  place-items: center;
  width: 82px;
  height: 82px;
  border: 6px solid #e9e2fb;
  border-top-color: #8c70e5;
  border-radius: 50%;
  color: var(--color-primary);
  margin: 2px 0 8px;
}
.task-title {
  color: #887b9f;
  font-size: 14px;
  line-height: 1.8;
}
h2 {
  font-size: 25px;
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
  inset: -6px;
  border: 6px solid transparent;
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
