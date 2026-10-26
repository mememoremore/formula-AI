<script setup lang="ts">
import type { JobStatus } from '#shared/types/tasks'
defineProps<{ status: JobStatus }>()
const steps = [
  { title: '上传图片', note: '原图已保存在账号' },
  { title: '识别公式', note: '等待或执行图片识别' },
  { title: '整理结果', note: '生成可编辑的公式' },
]
</script>
<template>
  <ol class="recognition-steps">
    <li
      v-for="(step, index) in steps"
      :key="step.title"
      :class="{
        complete: index === 0 || status === 'COMPLETED',
        current: index === 1 && status !== 'COMPLETED',
        failed: index === 1 && status === 'FAILED',
      }"
    >
      <span class="step-marker">
        <AppIcon v-if="index === 0 || status === 'COMPLETED'" name="check" :size="15" />
        <span v-else>{{ index + 1 }}</span>
      </span>
      <div>
        <strong>{{ step.title }}</strong>
        <p>
          {{
            index === 1 && status === 'FAILED'
              ? '未完成，可查看原因后重试'
              : index === 1 && status === 'PROCESSING'
                ? '正在识别图片中的公式…'
                : index === 1 && status === 'QUEUED'
                  ? '已进入队列，等待处理'
                  : step.note
          }}
        </p>
      </div>
    </li>
  </ol>
</template>
<style scoped>
.recognition-steps {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 25px;
  margin: 16px 0 30px;
  padding: 0 20px;
}
li {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 15px;
  min-height: 44px;
  color: #aaa1b6;
}
li:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 13px;
  top: 31px;
  width: 1px;
  height: 29px;
  background: #e0d8ee;
}
.step-marker {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 1px solid #ddd5e9;
  border-radius: 50%;
  font-size: 12px;
}
strong {
  font-size: 14px;
  line-height: 1.7;
  font-weight: 550;
}
p {
  font-size: 12px;
  line-height: 1.8;
  margin-top: 3px;
}
.complete .step-marker {
  color: #fff;
  background: #9c82db;
  border-color: #9c82db;
}
.current strong {
  color: #5d497f;
}
.current .step-marker {
  border-color: #a892dc;
  color: #8c6dba;
}
.failed strong {
  color: var(--color-danger);
}
</style>
