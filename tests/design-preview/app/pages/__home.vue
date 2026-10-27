<script setup lang="ts">
import HomePage from '~/pages/index.vue'
definePageMeta({
  middleware(to) {
    to.meta.contentWidth = to.query.width === 'reading' ? 'reading' : 'compact'
  },
})
const session = useAccountSession()
</script>
<template>
  <aside class="home-preview-tools">
    <p>R4 隔离预览 · 宽布局尚未应用于正式首页</p>
    <NuxtLink to="/__home?width=compact" class="text-button">480 居中</NuxtLink>
    <NuxtLink to="/__home?width=reading" class="text-button">阅读宽度</NuxtLink>
    <button class="text-button" @click="session.refresh()">刷新测试会话</button>
  </aside>
  <HomePage />
</template>
<style scoped>
.home-preview-tools {
  margin-bottom: 24px;
  padding: 12px;
  border: 1px dashed var(--color-border);
  font-size: 11px;
  color: var(--color-text-secondary);
}
.home-preview-tools .text-button {
  margin-right: 12px;
  font-size: 11px;
}
</style>
