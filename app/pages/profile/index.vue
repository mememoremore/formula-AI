<script setup lang="ts">
definePageMeta({ middleware: 'workspace', contentWidth: 'reading', alias: '/account' })
useHead({ title: '我的 · Formula AI' })
const session = useAccountSession()
await session
const { data: account, error, status, refresh } = session
const menus = [
  { to: '/settings', label: '设置', icon: 'settings' },
  { to: '/help', label: '使用帮助', icon: 'help' },
  { to: '/feedback', label: '意见反馈', icon: 'message' },
  { to: '/about', label: '关于项目', icon: 'info' },
] as const
const personal = [
  { to: '/library?space=account', label: '我的公式', detail: '整理和回顾', icon: 'book' },
  {
    to: '/library?space=account&view=favorites',
    label: '我的收藏',
    detail: '再次温习',
    icon: 'heart',
  },
  { to: '/ai?space=account', label: '学习对话', detail: '继续探索', icon: 'sparkles' },
] as const
</script>
<template>
  <div class="profile-page">
    <AppBrand :avatar="false" :account-user="account?.user ?? null" />
    <div v-if="status === 'pending'" class="card status-panel" role="status">正在确认账号…</div>
    <div v-else-if="error" class="card status-panel" role="alert">
      <h1>暂时无法确认账号</h1>
      <p>私有资料已隐藏，请重新连接；这里不会切换成游客资料。</p>
      <button class="text-button" @click="refresh()">重新加载账号</button>
    </div>
    <template v-else>
      <section class="profile-hero">
        <span class="profile-decoration" aria-hidden="true">✧</span>
        <UserAvatar :user="account?.user" :size="96" />
        <p class="eyebrow">你的公式空间</p>
        <h1>{{ account?.user?.name || '保持好奇，探索公式' }}</h1>
        <p class="profile-email">
          {{ account?.user?.email || '' }}
        </p>
        <NuxtLink
          :to="account?.user ? '/profile/edit' : '/login?redirect=/profile'"
          class="button"
          :class="account?.user ? 'button-outline' : 'button-primary'"
        >
          {{ account?.user ? '编辑资料' : '登录，开启公式空间' }}
        </NuxtLink>
      </section>
      <section v-if="account?.user" class="profile-shortcuts" aria-label="我的学习记录">
        <NuxtLink v-for="item in personal" :key="item.to" :to="item.to" class="card shortcut">
          <AppIcon :name="item.icon" :size="22" />
          <strong>{{ item.label }}</strong>
          <span>{{ item.detail }}</span>
        </NuxtLink>
      </section>
    </template>
    <div class="card menu-list section">
      <NuxtLink v-for="item in menus" :key="item.to" :to="item.to" class="menu-item">
        <AppIcon :name="item.icon" :size="20" />
        <span>{{ item.label }}</span>
        <AppIcon name="chevron" :size="17" class="menu-chevron" />
      </NuxtLink>
    </div>
  </div>
</template>
<style scoped>
.profile-hero {
  position: relative;
  text-align: center;
  padding: 10px 0 18px;
}
.profile-page :deep(.app-brand) {
  margin-bottom: 14px;
}
.profile-hero h1 {
  font-size: 26px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  margin-top: 8px;
}
.eyebrow {
  font-size: 12px;
  color: var(--color-primary);
  margin-top: 14px;
}
.profile-email {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.8;
  margin: 8px 0 14px;
  overflow-wrap: anywhere;
}
.profile-decoration {
  position: absolute;
  right: 22px;
  top: 12px;
  color: var(--color-primary);
  opacity: 0.4;
  font-size: 42px;
}
.profile-shortcuts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.shortcut {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  padding: 14px 6px;
  color: var(--color-primary);
}
.shortcut strong {
  font-size: 14px;
  color: var(--color-text);
}
.shortcut span {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.menu-item {
  min-height: 60px;
  padding-inline: 20px;
}
.profile-page > .menu-list.section {
  margin-top: 18px;
}
.demo-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px;
  min-width: 0;
}
.demo-entry > div {
  flex: 1;
  min-width: 0;
}
.demo-entry h2 {
  font-size: 16px;
}
.demo-entry p {
  font-size: 12px;
  line-height: 1.8;
  color: var(--color-text-secondary);
  margin-top: 6px;
}
.status-panel h1 {
  font-size: 22px;
}
.status-panel p {
  line-height: 1.8;
}
</style>
