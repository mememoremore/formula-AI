<script setup lang="ts">
definePageMeta({ middleware: 'auth', contentWidth: 'reading', alias: '/account/conversations' })
useHead({ title: 'AI 学习记录 · 墨析' })

const session = await useAccountSession()
</script>
<template>
  <div>
    <PageHeader title="AI 学习记录" back-to="/ai" />
    <AccountConversations v-if="session.data.value?.user" :owner-id="session.data.value.user.id" />
  </div>
</template>
