<script setup lang="ts">
definePageMeta({ middleware: 'auth', contentWidth: 'reading' })
useHead({ title: '批量处理 · 墨析' })

const session = await useAccountSession()
const owner = computed(() =>
  session.status.value === 'success' && !session.error.value
    ? session.data.value?.user?.id
    : undefined,
)
</script>
<template>
  <AccountBatchPreparation v-if="owner" :key="owner" :owner-id="owner" />
  <div v-else class="card status-panel">
    请重新确认账号。
    <button class="text-button" @click="session.refresh()">重新连接</button>
  </div>
</template>
