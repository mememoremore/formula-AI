<script setup lang="ts">
import { displayFormulaTitle } from '#shared/formula-title'

defineProps<{
  label?: string
  title: string
  subtitle: string
  to: string
  latex?: string
  imageSrc?: string
  sample?: boolean
  formula?: boolean
}>()
</script>

<template>
  <article class="card recent-entry">
    <NuxtLink :to="to" class="entry-link">
      <div v-if="label" class="entry-heading">
        <h2>{{ label }}</h2>
      </div>
      <div class="entry-body">
        <span v-if="!formula" class="entry-symbol"><AppIcon name="message" :size="20" /></span>
        <div class="entry-copy">
          <h3>{{ formula ? displayFormulaTitle(title) : title }}</h3>
          <p>{{ subtitle }}</p>
        </div>
        <AppIcon name="chevron" :size="18" />
      </div>
    </NuxtLink>
    <MathFormula
      v-if="latex && formula"
      class="entry-formula"
      :latex="latex"
      tabindex="0"
      :aria-label="displayFormulaTitle(title) + '公式预览，可横向滚动'"
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
  padding: 14px 16px;
  border-radius: var(--radius-card);
}
.entry-formula {
  margin: 0 20px 16px;
}
.entry-formula:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
.entry-heading {
  margin-bottom: 8px;
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
.entry-symbol {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 12px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}
.entry-copy p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
