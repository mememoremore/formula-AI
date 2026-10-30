<script setup lang="ts">
import type { UploadPreview } from '~/composables/useUploadPreview'
defineProps<{
  preview: UploadPreview | null
  checking: boolean
  disabled: boolean
  source: 'camera' | 'image'
}>()
defineEmits<{ choose: []; remove: [] }>()
</script>
<template>
  <section class="image-card card" aria-label="图片选择与预览">
    <button class="upload-zone" :disabled="disabled" @click="$emit('choose')">
      <img v-if="preview" :src="preview.url" alt="已选择的公式图片预览" />
      <template v-else>
        <span class="upload-symbol">
          <AppIcon :name="source === 'camera' ? 'camera' : 'image'" :size="28" />
        </span>
        <strong>
          {{
            checking ? '正在检查图片…' : source === 'camera' ? '拍摄你的公式' : '选择一张公式图片'
          }}
        </strong>
        <span>JPG / PNG · 最大 10MB · 2000 万像素</span>
      </template>
    </button>
    <div v-if="preview" class="preview-meta">
      <div class="preview-actions">
        <button class="text-button" :disabled="disabled" @click="$emit('choose')">重新选择</button>
        <button class="text-button" :disabled="disabled" @click="$emit('remove')">删除图片</button>
      </div>
    </div>
    <p v-else class="image-tip">让公式位于画面中间，保持光线均匀、文字清晰。</p>
  </section>
</template>
<style scoped>
.image-card {
  min-width: 0;
  padding: 16px;
}
.upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 220px;
  width: 100%;
  min-width: 0;
  padding: 20px 12px;
  border: 1.5px dashed var(--color-primary);
  border-radius: var(--radius-control);
  background: var(--color-background);
}
.upload-zone img {
  display: block;
  max-width: 100%;
  max-height: 300px;
  object-fit: contain;
}
.upload-zone strong {
  font-size: 16px;
  line-height: 1.7;
}
.upload-zone > span:last-child,
.image-tip {
  font-size: 12px;
  line-height: 1.8;
  color: var(--color-text-secondary);
}
.upload-symbol {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-card);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.image-tip {
  margin-top: 16px;
}
.preview-meta {
  margin-top: 14px;
  min-width: 0;
}
.preview-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}
</style>
