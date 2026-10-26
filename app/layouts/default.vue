<script setup lang="ts">
import { contentWidth } from '~/utils/layout'
const route = useRoute()
const showNav = computed(() => route.meta.bottomNav !== false)
const width = computed(() => contentWidth(route.meta.contentWidth))
</script>

<template>
  <div class="app-shell" :class="[{ 'has-bottom-nav': showNav }, 'layout-' + width]">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <main id="main-content" class="page-content" tabindex="-1"><slot /></main>
    <AppBottomNav v-if="showNav" :content-width="width" />
    <AppToast />
  </div>
</template>
