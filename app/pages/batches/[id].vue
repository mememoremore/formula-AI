<script setup lang="ts">
definePageMeta({ middleware: 'auth', contentWidth: 'reading' })
useHead({ title: '批量识别结果 · 墨析' })

const route = useRoute(),
  session = await useAccountSession()
const owner = computed(() =>
  session.status.value === 'success' && !session.error.value
    ? session.data.value?.user?.id
    : undefined,
)
const id = computed(() => String(route.params.id))
</script>
<template>
  <PageHeader title="批量识别结果" back-to="/batches" />
  <AccountRecognitionBatch v-if="owner" :id="id" :key="owner + ':' + id" :owner-id="owner" />
  <div v-else class="card status-panel">
    请重新确认账号。
    <button class="text-button" @click="session.refresh()">重新连接</button>
  </div>
</template>
