<script setup lang="ts">
definePageMeta({ middleware: 'auth', bottomNav: false, contentWidth: 'reading' })
useHead({ title: '手动输入 · 墨析' })

const session = useAccountSession()

await session

const ownerId = computed(() =>
  session.status.value === 'success' && !session.error.value
    ? session.data.value?.user?.id
    : undefined,
)
</script>
<template>
  <PageHeader title="手动输入" back-to="/library?space=account" />
  <div v-if="session.error.value" class="card status-panel" role="alert">
    <p>暂时无法确认账号，草稿不会转为游客保存。</p>
    <button class="text-button" @click="session.refresh()">重新连接账号</button>
  </div>
  <ManualFormulaCreator v-else-if="ownerId" :key="ownerId" :owner-id="ownerId" />
  <p v-else class="info-note" role="status">正在确认账号…</p>
</template>
