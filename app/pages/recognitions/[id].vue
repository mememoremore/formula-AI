<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  bottomNav: false,
  contentWidth: 'reading',
  alias: '/account/tasks/:id',
})
useHead({ title: '识别任务 · Formula AI' })
const route = useRoute(),
  session = useAccountSession()
await session
const ownerId = computed(() =>
  session.status.value === 'success' && !session.error.value
    ? session.data.value?.user?.id
    : undefined,
)
const id = computed(() => String(route.params.id))
const draft = useNuxtApp().$uploadDraft
watch(
  [session.status, () => session.data.value?.user?.id],
  ([status, id]) => {
    if (status === 'success') draft.confirmOwner(id ?? null)
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <PageHeader title="识别任务" back-to="/library?space=account&view=recent" />
  <div v-if="session.status.value === 'pending'" class="card status-panel" role="status">
    正在确认账号…
  </div>
  <div v-else-if="session.error.value" class="card status-panel" role="alert">
    <h2>暂时无法确认账号</h2>
    <p>已隐藏私有任务，请重新连接。</p>
    <button class="text-button" @click="session.refresh()">重新连接账号</button>
  </div>
  <AccountRecognitionTask
    v-else-if="ownerId"
    :key="ownerId + ':' + id"
    :id="id"
    :owner-id="ownerId"
  />
  <div v-else class="card status-panel" role="alert">
    <h2>请登录后查看任务</h2>
    <NuxtLink
      :to="{ path: '/login', query: { redirect: route.fullPath } }"
      class="button button-primary"
    >
      前往登录
    </NuxtLink>
  </div>
</template>
