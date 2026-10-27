<script setup lang="ts">
import type { AccountUser } from '#shared/types/account'
const props = withDefaults(
  defineProps<{ avatar?: boolean; tagline?: boolean; accountUser?: AccountUser | null }>(),
  { avatar: true, tagline: false },
)
// 首页已读取会话时直接展示传入值；其他现有页面保留原来的读取方式。
const session = props.accountUser === undefined ? useAccountSession() : undefined
const avatarUser = computed(() =>
  props.accountUser === undefined ? session?.data.value?.user : props.accountUser,
)
</script>
<template>
  <header class="app-brand">
    <NuxtLink to="/" class="brand-name" aria-label="Formula AI 首页">
      <svg viewBox="0 0 40 40" width="37" height="37" aria-hidden="true">
        <path
          d="M3 29 C10 39 18 8 21 7 S27 38 37 25"
          fill="none"
          stroke="currentColor"
          stroke-width="4"
          stroke-linecap="round"
        />
      </svg>
      <span>
        <strong>Formula AI</strong>
      </span>
    </NuxtLink>
    <NuxtLink v-if="avatar" to="/profile" aria-label="查看我的资料">
      <UserAvatar :user="avatarUser" :size="38" />
    </NuxtLink>
  </header>
  <p v-if="tagline" class="brand-tagline">让每一个手写公式都能被理解</p>
</template>
<style scoped>
.app-brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 26px;
}
.brand-name {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: var(--color-primary);
}
strong {
  color: var(--color-text);
  font-size: 22px;
  letter-spacing: -0.5px;
}
.brand-tagline {
  margin: -18px 0 24px;
  font-size: 14px;
  letter-spacing: 0.5px;
  color: var(--color-muted);
}
</style>
