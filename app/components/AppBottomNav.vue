<script setup lang="ts">
import { mainTabs, navigationSection, mainTabDestination } from '#shared/navigation'
import type { ContentWidth } from '~/utils/layout'
withDefaults(defineProps<{ contentWidth?: ContentWidth }>(), { contentWidth: 'compact' })
const route = useRoute()
const activeSection = computed(() => navigationSection(route.path))
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
// URL fragment 不会发送给 SSR；挂载前两端都省略，避免旧地址带锚点时水合不一致。
const tabRoute = computed(() => ({
  path: route.path,
  fullPath: mounted.value ? route.fullPath : route.fullPath.split('#', 1)[0]!,
  query: route.query,
}))
</script>
<template>
  <Teleport to="#teleports">
    <nav class="bottom-nav" :class="'layout-' + contentWidth" aria-label="主导航">
      <NuxtLink
        v-for="tab in mainTabs"
        :key="tab.to"
        :to="mainTabDestination(tab.to, tabRoute)"
        class="nav-item"
        :class="{ active: activeSection === tab.to }"
        :aria-current="activeSection === tab.to ? 'page' : undefined"
      >
        <AppIcon :name="tab.icon" :size="25" />
        <span>{{ tab.label }}</span>
      </NuxtLink>
    </nav>
  </Teleport>
</template>
<style scoped>
.bottom-nav {
  position: fixed;
  z-index: 40;
  bottom: 0;
  inset-inline: 0;
  margin-inline: auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  width: min(100%, var(--app-width));
  min-height: var(--nav-height);
  padding: 9px max(12px, var(--safe-area-right)) calc(9px + var(--safe-area-bottom))
    max(12px, var(--safe-area-left));
  border: 1px solid #eeedf8;
  border-bottom: 0;
  border-radius: 22px 22px 0 0;
  background: rgb(255 255 255 / 97%);
  box-shadow: 0 -5px 24px #5447b004;
  backdrop-filter: blur(16px);
}
.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #9295a8;
  font-size: 11px;
  min-height: 53px;
  border-radius: 12px;
}
.nav-item.active {
  color: var(--color-primary);
  font-weight: 600;
}
.nav-item.active :deep(svg) {
  fill: #7760ff;
  stroke: #653cff;
  filter: drop-shadow(0 2px 3px #7351ff26);
}
</style>
