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
        <p>保存在当前账号的私有空间。</p>
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
        <p>
          {{
            status === 'QUEUED'
              ? '已进入队列，也可能正在等待自动重试。'
              : status === 'PROCESSING'
                ? '正在处理图片，暂不提供精确进度。'
                : status === 'COMPLETED'
                  ? '公式结果已经保存。'
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
        <p>
          {{
            status === 'COMPLETED'
              ? '可继续编辑、分类或交给 AI 解释。'
              : status === 'FAILED'
                ? '请先检查图片与识别模式，再决定是否重新提交。'
                : '阶段提示不代表模型内部处理步骤或百分比。'
          }}
        </p>
      </div>
    </li>
  </ol>
</template>
<style scoped>
.recognition-steps {
  display: grid;
  gap: 20px;
  list-style: none;
  margin: 8px 0 24px;
  padding: 0;
}
li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  color: var(--color-text-secondary);
  min-width: 0;
}
li > svg {
  flex-shrink: 0;
  margin-top: 4px;
  color: var(--color-primary);
}
strong {
  font-size: 14px;
  line-height: 1.8;
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
