<script setup lang="ts">
import { libraryView } from '#shared/navigation'
definePageMeta({
  contentWidth: 'workspace',
  middleware: 'workspace',
  alias: ['/account/library', '/account/favorites', '/account/history', '/favorites', '/history'],
})
useHead({ title: '我的公式库 · Formula AI' })
const route = useRoute()
const { query, search } = useLibraryFilters()
const { data: account, error, refresh, demo, status } = useWorkspace()
await useAccountSession()
let confirmedOwner = account.value?.user?.id
watch(
  [status, () => account.value?.user?.id],
  ([phase, id]) => {
    // 只在已确认的身份变化时清除。离页时 Nuxt 释放会话数据不是退出登录。
    if (phase !== 'success') return
    if (confirmedOwner && confirmedOwner !== id)
      clearNuxtData(
        (key) =>
          key === 'account-categories' ||
          key.startsWith('account-library-') ||
          key.startsWith('account-history-'),
      )
    confirmedOwner = id
  },
  { flush: 'sync' },
)
</script>
<template>
  <div class="library-brand"><AppBrand :account-user="account?.user ?? null" /></div>
  <header class="library-hero">
    <div>
      <p class="library-kicker">每一次思考，都值得留存</p>
      <h1>我的公式库</h1>
      <p>整理、回顾，也继续探索。</p>
    </div>
    <img src="/images/library-paper.svg" alt="" aria-hidden="true" width="220" height="240" />
  </header>
  <div v-if="error" class="card status-panel" role="alert">
    <p>账号状态暂时无法读取。</p>
    <button class="text-button" :disabled="status === 'pending'" @click="refresh()">
      重新连接账号
    </button>
  </div>
  <div v-else-if="status === 'pending'" class="card status-panel" role="status">
    正在确认公式空间…
  </div>
  <DemoLibrary v-else-if="demo" />
  <template v-else-if="account?.user">
    <div class="section-heading library-create">
      <NuxtLink class="text-button" to="/formulas/new">手动创建公式</NuxtLink>
    </div>
    <LibrarySearch v-model="query" @search="search" />
    <LibraryViews />
    <template v-if="libraryView(route.query.view) === 'recent'">
      <AccountHistory
        :key="account.user.id + ':' + String(route.query.q || '')"
        :owner-id="account.user.id"
        :query="typeof route.query.q === 'string' ? route.query.q : ''"
      />
    </template>
    <AccountLibrary
      v-else
      :kind="libraryView(route.query.view) === 'favorites' ? 'favorites' : 'library'"
      :owner-id="account.user.id"
      :key="account.user.id + ':' + libraryView(route.query.view)"
    />
  </template>
  <p v-if="demo && !error" class="library-demo-note">本机演示 · 数据仅保存在当前浏览器</p>
</template>
<style scoped>
.library-brand :deep(a) {
  min-height: var(--control-hit-area);
}
.library-brand :deep(a[aria-label='查看我的资料']) {
  min-width: var(--control-hit-area);
  display: grid;
  place-items: center;
}
.library-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px;
  align-items: center;
  gap: 12px;
  margin: 4px 0 10px;
  min-height: 112px;
}
.library-create {
  margin-bottom: 8px;
}
h1 {
  font-size: 30px;
  letter-spacing: -1px;
  line-height: 1.5;
}
.library-hero p {
  font-size: 13px;
  line-height: 1.8;
  color: var(--color-text-secondary);
  margin-top: 6px;
}
.library-hero .library-kicker {
  color: var(--color-primary);
  font-size: 10px;
  letter-spacing: 0.5px;
  margin: 0 0 6px;
}
.library-hero img {
  display: block;
  width: 100%;
  height: auto;
}
.library-demo-note {
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 11px;
  margin: 24px 0 0;
  line-height: 1.8;
}
@media (min-width: 390px) {
  .library-hero {
    grid-template-columns: minmax(0, 1fr) 116px;
  }
  h1 {
    font-size: 34px;
  }
}
</style>
