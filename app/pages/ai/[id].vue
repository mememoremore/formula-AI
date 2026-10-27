<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  bottomNav: false,
  contentWidth: 'reading',
  alias: '/account/conversations/:id',
})
useHead({ title: 'AI 对话 · Formula AI' })
const route = useRoute(),
  session = useAccountSession()
await session
const ownerId = computed(() =>
  session.status.value === 'success' && !session.error.value
    ? session.data.value?.user?.id
    : undefined,
)
const id = computed(() => String(route.params.id))
const intents = useNuxtApp().$chatDraft
watch(
  [session.status, () => session.data.value?.user?.id],
  ([status, id]) => {
    if (status === 'success') intents.confirmOwner(id ?? null)
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <div class="ai-page">
    <div v-if="session.status.value === 'pending'" class="status-panel" role="status">
      正在确认账号…
    </div>
    <div v-else-if="session.error.value" class="status-panel" role="alert">
      <p>暂时无法确认账号，已隐藏私有对话。</p>
      <button class="text-button" @click="session.refresh()">重新连接账号</button>
    </div>
    <AccountChat
      v-else-if="ownerId"
      :key="ownerId + ':' + id"
      :conversation-id="id"
      :owner-id="ownerId"
    />
    <div v-else class="status-panel">
      <PageHeader title="AI 对话" back-to="/ai" />
      <NuxtLink
        :to="{ path: '/login', query: { redirect: route.fullPath } }"
        class="button button-primary"
      >
        登录查看对话
      </NuxtLink>
    </div>
  </div>
</template>
