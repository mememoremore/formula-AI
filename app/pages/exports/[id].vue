<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  bottomNav: false,
  alias: '/account/exports/:id',
  contentWidth: 'reading',
})
useHead({ title: 'Word 导出 · Formula AI' })
const route = useRoute()
const session = useAccountSession()
await session
const ownerId = computed(() =>
  session.status.value === 'success' && !session.error.value
    ? session.data.value?.user?.id
    : undefined,
)
const id = computed(() => String(route.params.id))
</script>
<template>
  <AccountExportTask v-if="ownerId" :key="ownerId + ':' + id" :id="id" :owner-id="ownerId" />
  <template v-else>
    <PageHeader title="Word 导出" back-to="/library" />
    <div class="card section stack" role="status">
      <h2>{{ session.error.value ? '暂时无法确认账号' : '请登录后查看导出任务' }}</h2>
      <button v-if="session.error.value" class="button button-secondary" @click="session.refresh()">
        重新连接账号
      </button>
      <NuxtLink
        v-else
        :to="{ path: '/login', query: { redirect: route.fullPath } }"
        class="button button-primary"
      >
        前往登录
      </NuxtLink>
    </div>
  </template>
</template>
