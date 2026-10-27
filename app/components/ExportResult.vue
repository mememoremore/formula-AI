<script setup lang="ts">
import type { ExportTaskState } from '#shared/types/tasks'
defineProps<{ task: ExportTaskState; downloadable: boolean; busy: boolean }>()
defineEmits<{ download: [] }>()
function size(value: number) {
  return value < 1024
    ? value + ' B'
    : value < 1024 * 1024
      ? (value / 1024).toFixed(1) + ' KB'
      : (value / 1024 / 1024).toFixed(1) + ' MB'
}
</script>
<template>
  <section class="export-complete">
    <span class="document-art" aria-hidden="true">
      <AppIcon name="book" :size="42" />
      <span>W</span>
    </span>
    <h2>导出已完成</h2>
    <p>文件已生成，可下载到本地继续编辑。</p>
  </section>
  <div class="card document-card">
    <span class="document-icon"><AppIcon name="download" :size="24" /></span>
    <div>
      <h3>{{ task.file?.name || task.title + '.docx' }}</h3>
      <p>
        {{ task.file ? size(task.file.sizeBytes) : 'Word 文档' }} · 公式版本 v{{
          task.versionNumber
        }}
      </p>
    </div>
  </div>
  <button
    v-if="downloadable"
    type="button"
    :disabled="busy"
    :aria-busy="busy"
    @click="$emit('download')"
    class="button button-primary button-block section"
  >
    <AppIcon name="download" :size="19" />
    {{ busy ? '正在准备下载…' : '下载 Word' }}
  </button>
</template>
<style scoped>
.export-complete {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 16px 0 24px;
}
.document-art {
  position: relative;
  display: grid;
  place-items: center;
  width: 88px;
  height: 100px;
  border: 1px solid #e7e0d9;
  border-radius: 8px 26px 12px 6px;
  background: #fffcf6;
  transform: rotate(-7deg);
  box-shadow: 8px 10px 0 #ede6fc;
  margin-bottom: 28px;
  color: #a492b4;
}
.document-art > span {
  position: absolute;
  left: 17px;
  top: 27px;
  width: 42px;
  height: 42px;
  border-radius: 7px;
  background: #7c64cf;
  color: white;
  font:
    bold 26px/42px Georgia,
    serif;
}
h2 {
  font-size: 25px;
  margin-bottom: 14px;
}
p {
  font-size: 13px;
  line-height: 1.8;
  color: var(--color-muted);
}
.document-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px;
  min-width: 0;
}
.document-card > div {
  min-width: 0;
}
.document-icon {
  color: var(--color-primary);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 45px;
  height: 50px;
  border-radius: 9px;
  background: #eee8fa;
}
h3 {
  font-size: 14px;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.document-card p {
  font-size: 11px;
  margin-top: 7px;
}
</style>
