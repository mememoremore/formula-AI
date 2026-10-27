<script setup lang="ts">
definePageMeta({
  middleware: 'workspace',
  bottomNav: false,
  contentWidth: 'reading',
  alias: '/account/chat',
})
useHead({ title: '新对话 · Formula AI' })
const route = useRoute(),
  session = useAccountSession()
await session
const ownerId = computed(() =>
  session.status.value === 'success' && !session.error.value
    ? session.data.value?.user?.id
    : undefined,
)
const demo = computed(
  () =>
    session.status.value === 'success' &&
    !session.error.value &&
    (route.query.space === 'demo' || !ownerId.value) &&
    !route.query.versionId,
)
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
      <p>暂时无法确认账号，不会切换为演示发送。</p>
      <button class="text-button" @click="session.refresh()">重新连接账号</button>
    </div>
    <DemoChat
      v-else-if="demo"
      :key="
        String(route.query.formulaId ?? 'general') +
        ':' +
        String(route.query.demoVersionId ?? 'latest')
      "
    />
    <AccountChatDraft
      v-else-if="ownerId"
      :key="ownerId + ':' + String(route.query.versionId ?? 'general')"
      :owner-id="ownerId"
      :version-id="typeof route.query.versionId === 'string' ? route.query.versionId : ''"
    />
    <div v-else class="status-panel">
      <NuxtLink to="/login?redirect=/ai/new" class="button button-primary">
        登录使用账号 AI
      </NuxtLink>
    </div>
  </div>
</template>
