<script setup lang="ts">
definePageMeta({ middleware: 'workspace', alias: '/account' })
useHead({ title: '我的 · Formula AI' })
const { data: account, error, refresh } = await useAccountSession()
const menus = [
  { to: '/settings', label: '设置', icon: 'settings' },
  { to: '/help', label: '使用帮助', icon: 'help' },
  { to: '/feedback', label: '意见反馈', icon: 'message' },
  { to: '/about', label: '关于项目', icon: 'info' },
] as const
</script>
<template>
  <AppBrand :avatar="false" />
  <section class="profile-hero">
    <span class="profile-decoration" aria-hidden="true">✧</span>
    <UserAvatar :user="account?.user" :size="96" />
    <h1>{{ account?.user?.name || '公式探索者' }}</h1>
    <p>{{ account?.user?.email || '在公式的世界里，保持好奇。' }}</p>
    <NuxtLink
      :to="account?.user ? '/profile/edit' : '/login?redirect=/profile/edit'"
      class="button button-outline"
    >
      {{ account?.user ? '编辑资料' : '登录，开启公式空间' }}
    </NuxtLink>
  </section>
  <div v-if="error" class="status-panel" role="alert">
    资料暂时无法读取。
    <button class="text-button" @click="refresh()">重新加载</button>
  </div>
  <div class="card menu-list section">
    <NuxtLink v-for="item in menus" :key="item.to" :to="item.to" class="menu-item">
      <AppIcon :name="item.icon" :size="20" />
      <span>{{ item.label }}</span>
      <AppIcon name="chevron" :size="17" class="menu-chevron" />
    </NuxtLink>
  </div>
  <p class="page-footnote">把每一次思考，整理成知识</p>
</template>
<style scoped>
.profile-hero {
  position: relative;
  text-align: center;
  padding: 28px 0 20px;
}
h1 {
  font-size: 24px;
  margin-top: 24px;
  overflow-wrap: anywhere;
}
.profile-hero p {
  font-size: 13px;
  color: var(--color-muted);
  margin: 12px 0 24px;
  overflow-wrap: anywhere;
}
.profile-decoration {
  position: absolute;
  right: 30px;
  top: 30px;
  font-size: 42px;
  color: #b9abed;
}
.menu-item {
  min-height: 72px;
  padding-inline: 22px;
}
</style>
