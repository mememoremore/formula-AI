<script setup lang="ts">
import DefaultLayout from '~/layouts/default.vue'
const session = useAccountSession()
</script>
<template>
  <DefaultLayout>
    <aside class="preview-tools">
      <p>R5 隔离比较 · 正式公式库使用 workspace</p>
      <button class="text-button" @click="session.refresh()">刷新测试身份</button>
    </aside>
    <slot />
  </DefaultLayout>
</template>
<style scoped>
.preview-tools {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-bottom: 20px;
}
</style>
