<script setup lang="ts">
import { libraryView } from '#shared/navigation'
definePageMeta({
  middleware: 'workspace',
  alias: ['/account/library', '/account/favorites', '/account/history', '/favorites', '/history'],
})
useHead({ title: '我的公式库 · Formula AI' })
const route = useRoute()
const { data: account, error, refresh, demo } = useWorkspace()
await useAccountSession()
</script>
<template>
  <AppBrand />
  <section class="library-hero">
    <h1>我的公式库</h1>
    <p>整理与回顾你的公式</p>
    <img src="/images/library-paper.svg" alt="" aria-hidden="true" />
  </section>
  <div v-if="error" class="card status-panel" role="alert">
    <p>账号状态暂时无法读取。</p>
    <button class="text-button" @click="refresh()">重新连接</button>
  </div>
  <DemoLibrary v-else-if="demo" />
  <template v-else-if="account?.user">
    <template v-if="libraryView(route.query.view) === 'recent'">
      <LibraryViews />
      <AccountHistory />
    </template>
    <AccountLibrary
      v-else
      :kind="libraryView(route.query.view) === 'favorites' ? 'favorites' : 'library'"
      :key="libraryView(route.query.view)"
    />
  </template>
  <p v-if="demo" class="library-demo-note">本机演示 · 数据仅保存在当前浏览器</p>
</template>
<style scoped>
.library-hero {
  position: relative;
  min-height: 158px;
  padding-top: 24px;
  isolation: isolate;
}
h1 {
  position: relative;
  z-index: 1;
  font-size: 36px;
  letter-spacing: -1px;
  line-height: 1.4;
}
.library-hero p {
  position: relative;
  z-index: 1;
  color: #7b80a9;
  font-size: 17px;
  margin-top: 6px;
}
.library-hero img {
  position: absolute;
  z-index: 0;
  pointer-events: none;
  width: 198px;
  height: 190px;
  object-fit: contain;
  right: -24px;
  top: -18px;
}
.library-demo-note {
  text-align: center;
  color: #9697ae;
  font-size: 11px;
  margin: 24px 0 0;
  line-height: 1.7;
}
@media (max-width: 390px) {
  h1 {
    font-size: 32px;
  }
  .library-hero p {
    font-size: 15px;
  }
  .library-hero img {
    width: 166px;
    height: 166px;
    right: -25px;
  }
  .library-hero {
    min-height: 145px;
  }
}
</style>
