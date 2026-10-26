<script setup lang="ts">
const route = useRoute()
const showNav = computed(() => route.meta.bottomNav !== false)
</script>

<template>
  <div class="app-shell" :class="{ 'has-bottom-nav': showNav }">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <main id="main-content" class="page-content"><slot /></main>
    <AppBottomNav v-if="showNav" />
    <AppToast />
  </div>
</template>
