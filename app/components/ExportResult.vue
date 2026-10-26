<script setup lang="ts">
import type { ExportTaskState } from '#shared/types/tasks'
defineProps<{ task: ExportTaskState }>()
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
  <a
    v-if="task.downloadUrl"
    :href="task.downloadUrl"
    download
    class="button button-primary button-block section"
  >
    <AppIcon name="download" :size="19" />
    下载 Word
  </a>
</template>
<style scoped>
.export-complete {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 26px 0 34px;
}
.document-art {
  position: relative;
  display: grid;
  place-items: center;
  width: 135px;
  height: 150px;
  border: 1px solid #e7e0d9;
  border-radius: 8px 26px 12px 6px;
  background: #fffcf6;
  transform: rotate(-7deg);
  box-shadow: 8px 10px 0 #ede6fc;
  margin-bottom: 38px;
  color: #a492b4;
}
.document-art > span {
  position: absolute;
  left: 28px;
  top: 47px;
  width: 52px;
  height: 52px;
  border-radius: 7px;
  background: #7c64cf;
  color: white;
  font:
    bold 31px/52px Georgia,
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
  gap: 17px;
  padding: 23px;
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
