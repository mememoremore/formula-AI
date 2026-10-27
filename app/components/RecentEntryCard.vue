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
  <article class="card recent-entry">
    <NuxtLink :to="to" class="entry-link">
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
    <MathFormula
      v-if="latex"
      class="entry-formula"
      :latex="latex"
      tabindex="0"
      :aria-label="title + '公式预览，可横向滚动'"
    />
  </article>
</template>

<style scoped>
.recent-entry {
  display: block;
  border: 1px solid var(--color-border);
}
.entry-link {
  display: block;
  padding: 20px;
  border-radius: var(--radius-card);
}
.entry-formula {
  margin: 0 20px 12px;
}
.entry-formula:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
.entry-heading {
  margin-bottom: 12px;
}
h2 {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 500;
}
.entry-body {
  display: flex;
  align-items: center;
  gap: 16px;
}
.entry-body :deep(.formula-thumbnail) {
  flex-basis: 82px;
  width: 82px;
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
  color: var(--color-text-secondary);
  line-height: 1.7;
  overflow-wrap: anywhere;
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
