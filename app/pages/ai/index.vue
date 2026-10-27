<script setup lang="ts">
definePageMeta({
  middleware: 'workspace',
  contentWidth: 'reading',
  alias: '/account/conversations',
})
useHead({ title: 'AI 助手 · Formula AI' })
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
    (route.query.space === 'demo' || !ownerId.value),
)
const intents = useNuxtApp().$chatDraft
watch(
  [session.status, () => session.data.value?.user?.id],
  ([status, id]) => {
    if (status === 'success') intents.confirmOwner(id ?? null)
  },
  { immediate: true, flush: 'sync' },
)
if (typeof route.query.formulaId === 'string' && route.query.space !== 'account')
  await navigateTo(
    { path: '/ai/new', query: { space: 'demo', formulaId: route.query.formulaId } },
    { replace: true },
  )
</script>
<template>
  <div class="ai-page">
    <AppBrand :account-user="session.data.value?.user ?? null" />
    <header class="ai-intro">
      <p class="eyebrow">理解，从一次提问开始</p>
      <h1>
        AI 助手
        <span>✧</span>
      </h1>
      <p>留住每一段思考，让公式变得清晰。</p>
    </header>
    <div v-if="session.status.value === 'pending'" class="status-panel" role="status">
      正在确认账号…
    </div>
    <div v-else-if="session.error.value" class="status-panel" role="alert">
      <p>暂时无法连接账号服务。</p>
      <button class="text-button" @click="session.refresh()">重新连接</button>
    </div>
    <template v-else-if="demo">
      <NuxtLink to="/ai/new?space=demo" class="button button-primary button-block">
        <AppIcon name="plus" :size="19" />
        打开本机演示对话
      </NuxtLink>
      <EmptyState
        title="从一个问题开始"
        description="本机演示按公式版本保存模拟对话。再次打开可继续普通演示；从演示公式进入可继续对应记录。账号列表与本机记录独立。"
      />
      <NuxtLink to="/login?redirect=/ai" class="text-button">
        登录使用账号 AI
        <AppIcon name="arrowRight" :size="15" />
      </NuxtLink>
    </template>
    <AccountConversations v-else-if="ownerId" :key="ownerId" :owner-id="ownerId" />
  </div>
</template>
<style scoped>
.ai-intro {
  padding: 28px 0 24px;
}
.eyebrow {
  color: var(--color-primary);
  font-size: 12px;
  letter-spacing: 0.08em;
}
.ai-intro h1 {
  font-size: 32px;
  line-height: 1.4;
  margin: 8px 0;
}
.ai-intro h1 span {
  margin-left: 14px;
  color: var(--color-primary);
}
.ai-intro > p:last-child {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.8;
}
</style>
