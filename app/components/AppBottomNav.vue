<script setup lang="ts">
import { mainTabs, navigationSection } from '#shared/navigation'
const route = useRoute()
</script>
<template>
  <Teleport to="#teleports">
  <nav class="bottom-nav" aria-label="主导航">
    <NuxtLink
      v-for="tab in mainTabs"
      :key="tab.to"
      :to="tab.to"
      class="nav-item"
      :class="{ active: navigationSection(route.path) === tab.to }"
      :aria-current="navigationSection(route.path) === tab.to ? 'page' : undefined"
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
  padding: 9px 12px calc(9px + env(safe-area-inset-bottom));
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
