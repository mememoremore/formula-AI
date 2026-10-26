<script setup lang="ts">
const props = defineProps<{ title: string; backTo?: string; subtitle?: string }>()
const { destination, goBack } = usePageReturn(() => props.backTo ?? '/')
</script>
<template>
  <header class="page-header">
    <div class="row">
      <a
        v-if="backTo"
        :href="destination"
        class="icon-button back-link"
        aria-label="返回上一页"
        @click.prevent="goBack"
      >
        <AppIcon name="arrowLeft" :size="20" />
      </a>
      <h1>{{ title }}</h1>
      <slot />
    </div>
    <p v-if="subtitle" class="header-subtitle">{{ subtitle }}</p>
  </header>
</template>
<style scoped>
.page-header {
  margin-bottom: 28px;
}
.back-link {
  margin-left: -12px;
  flex-shrink: 0;
}
h1 {
  font-size: 21px;
}
.header-subtitle {
  margin-top: 7px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-muted);
}
</style>
