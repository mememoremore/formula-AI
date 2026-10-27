<!-- R3 829f7ad 卡片快照，仅供首页修改前截图。 -->
<script setup lang="ts">
defineProps<{
  label: string
  title: string
  subtitle: string
  to: string
  latex?: string
  imageSrc?: string
  sample?: boolean
}>()
</script>

<template>
  <NuxtLink :to="to" class="card recent-entry">
    <div class="entry-heading">
      <h2>{{ label }}</h2>
    </div>
    <div class="entry-body">
      <FormulaThumbnail :src="imageSrc" :latex="latex" :sample="sample" />
      <div class="entry-copy">
        <h3>{{ title }}</h3>
        <p>{{ subtitle }}</p>
      </div>
      <AppIcon name="chevron" :size="18" />
    </div>
  </NuxtLink>
</template>

<style scoped>
.recent-entry {
  display: block;
  padding: 18px 20px;
  border: 1px solid #eeedf8;
}
.entry-heading {
  margin-bottom: 12px;
}
h2 {
  font-size: 16px;
}
.entry-body {
  display: flex;
  align-items: center;
  gap: 16px;
}
.entry-body :deep(.formula-thumbnail) {
  flex-basis: 104px;
  width: 104px;
  height: 70px;
}
.entry-body :deep(.math-inline) {
  font-size: 11px;
}
.entry-copy {
  flex: 1;
  min-width: 0;
}
h3 {
  font-size: 15px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
p {
  margin-top: 5px;
  font-size: 12px;
  color: var(--color-muted);
  line-height: 1.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.app-icon {
  color: #77779c;
  flex-shrink: 0;
}
@media (max-width: 390px) {
  .entry-body {
    gap: 12px;
  }
  .entry-body :deep(.formula-thumbnail) {
    flex-basis: 82px;
    width: 82px;
  }
}
</style>
