<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    subtitle: string
    artwork?: 'formula' | 'book' | 'idea'
    level?: 1 | 2
  }>(),
  { level: 1 },
)
</script>
<template>
  <div class="page-intro" :class="{ 'with-art': artwork }">
    <div>
      <component :is="level === 2 ? 'h2' : 'h1'" class="intro-title">{{ title }}</component>
      <p>{{ subtitle }}</p>
    </div>
    <div v-if="artwork" class="intro-art"><PaperArtwork :kind="artwork" compact /></div>
  </div>
</template>
<style scoped>
.page-intro {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 110px;
  margin-bottom: 24px;
}
.intro-title {
  font-size: 28px;
  letter-spacing: -1px;
}
p {
  color: var(--color-muted);
  font-size: 13px;
  margin-top: 9px;
  line-height: 1.8;
  max-width: 240px;
}
.intro-art {
  position: absolute;
  right: 0;
  top: -6px;
  width: 110px;
  height: 105px;
  opacity: 0.66;
  z-index: 0;
}
.page-intro > div:first-child {
  position: relative;
  z-index: 1;
}
.with-art > div:first-child {
  max-width: calc(100% - 75px);
}
</style>
