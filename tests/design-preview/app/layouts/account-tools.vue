<script setup lang="ts">
import DefaultLayout from '~/layouts/default.vue'
async function refreshIdentity() {
  await refreshNuxtData('account-session')
}
</script>
<template>
  <DefaultLayout>
    <aside class="preview-tools">
      <p>R9 受控身份验证工具</p>
      <button class="text-button" @click="refreshIdentity">重新读取测试身份</button>
    </aside>
    <slot />
  </DefaultLayout>
</template>
<style scoped>
.preview-tools {
  font-size: 12px;
  margin-bottom: 16px;
  color: var(--color-text-secondary);
}
</style>
