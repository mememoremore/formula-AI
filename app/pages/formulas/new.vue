<script setup lang="ts">
definePageMeta({ middleware: 'auth', bottomNav: false, contentWidth: 'reading' })
useHead({ title: '手动创建公式 · Formula AI' })
const session = useAccountSession()
await session
const ownerId = computed(() =>
  session.status.value === 'success' && !session.error.value
    ? session.data.value?.user?.id
    : undefined,
)
</script>
<template>
  <PageHeader title="手动创建公式" back-to="/library?space=account" />
  <PageIntro
    :level="2"
    title="让公式，从输入开始"
    subtitle="输入 LaTeX，预览后保存。无需上传图片。"
  />
  <div v-if="session.error.value" class="card status-panel" role="alert">
    <p>暂时无法确认账号，草稿不会转为游客保存。</p>
    <button class="text-button" @click="session.refresh()">重新连接账号</button>
  </div>
  <ManualFormulaCreator v-else-if="ownerId" :key="ownerId" :owner-id="ownerId" />
  <p v-else class="info-note" role="status">正在确认账号…</p>
</template>
