<script setup lang="ts">
definePageMeta({ middleware: 'workspace', alias: '/account/conversations' })
useHead({ title: 'AI 助手 · Formula AI' })
const route = useRoute()
const { data: account, error, refresh, demo } = useWorkspace()
await useAccountSession()
if (typeof route.query.formulaId === 'string' && route.query.space !== 'account')
  await navigateTo(
    { path: '/ai/new', query: { space: 'demo', formulaId: route.query.formulaId } },
    { replace: true },
  )
</script>
<template>
  <AppBrand />
  <PageIntro title="AI 助手" subtitle="从公式开始，也可以直接提问" artwork="idea" />
  <div v-if="error" class="status-panel" role="alert">
    <p>暂时无法连接账号服务。</p>
    <button class="text-button" @click="refresh()">重新连接</button>
  </div>
  <template v-else-if="demo">
    <NuxtLink to="/ai/new?space=demo" class="button button-primary button-block">
      <AppIcon name="plus" :size="19" />
      新对话
    </NuxtLink>
    <EmptyState
      title="从一个问题开始"
      description="游客使用本机模拟对话；登录后可使用账号 AI 并保存记录。"
    />
    <NuxtLink to="/login?redirect=/ai" class="text-button">
      登录使用账号 AI
      <AppIcon name="arrowRight" :size="15" />
    </NuxtLink>
  </template>
  <AccountConversations v-else-if="account?.user" />
</template>
