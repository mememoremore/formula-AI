<script setup lang="ts">
import type { JobStatus } from '#shared/types/tasks'
defineProps<{ status: JobStatus }>()
</script>
<template>
  <ol class="recognition-steps" aria-label="识别阶段提示">
    <li class="complete">
      <AppIcon name="check" :size="18" />
      <div>
        <strong>原图已上传</strong>
      </div>
    </li>
    <li :class="{ failed: status === 'FAILED', complete: status === 'COMPLETED' }">
      <AppIcon
        :name="status === 'COMPLETED' ? 'check' : status === 'FAILED' ? 'info' : 'sparkles'"
        :size="18"
      />
      <div>
        <strong>
          {{
            status === 'QUEUED'
              ? '等待后台处理'
              : status === 'PROCESSING'
                ? '正在识别'
                : status === 'COMPLETED'
                  ? '后台处理完成'
                  : '识别未完成'
          }}
        </strong>
        <p v-if="status === 'QUEUED' || status === 'PROCESSING' || status === 'FAILED'">
          {{
            status === 'QUEUED'
              ? '已进入队列，也可能正在等待自动重试。'
              : status === 'PROCESSING'
                ? '正在处理图片，暂不提供精确进度。'
                : '请查看原因，确认后可重新提交。'
          }}
        </p>
      </div>
    </li>
    <li :class="{ complete: status === 'COMPLETED' }">
      <AppIcon :name="status === 'COMPLETED' ? 'check' : 'book'" :size="18" />
      <div>
        <strong>
          {{
            status === 'COMPLETED'
              ? '查看与核对公式'
              : status === 'FAILED'
                ? '本次没有公式结果'
                : '等待公式结果'
          }}
        </strong>
      </div>
    </li>
  </ol>
</template>
<style scoped>
.recognition-steps {
  display: grid;
  gap: 14px;
  list-style: none;
  margin: 8px 0 18px;
  padding: 0;
}
li {
  display: flex;
  gap: 10px;
  align-items: center;
  color: var(--color-text-secondary);
  min-width: 0;
}
li > svg {
  flex-shrink: 0;
  margin-top: 0;
  color: var(--color-primary);
}
strong {
  font-size: 14px;
  line-height: 1.6;
}
p {
  font-size: 12px;
  line-height: 1.9;
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.complete strong {
  color: var(--color-text);
}
.failed strong,
.failed > svg {
  color: var(--color-danger);
}
</style>
