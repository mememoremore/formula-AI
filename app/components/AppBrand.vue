<script setup lang="ts">
withDefaults(defineProps<{ avatar?: boolean; tagline?: boolean }>(), { avatar: true, tagline: false })
const { data: account } = useAccountSession()
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
      <UserAvatar :user="account?.user" :size="38" />
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
  letter-spacing: .5px;
  color: var(--color-muted);
}
</style>
