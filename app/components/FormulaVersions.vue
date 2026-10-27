<script setup lang="ts">
const props = defineProps<{
  open: boolean
  versions: {
    id: string
    number: number
    latex: string
    label: string
    createdAt: string
    to: string | { path: string; query: Record<string, string> }
  }[]
}>()
defineEmits<{ close: [] }>()
</script>
<template>
  <AppModal :open="open" title="版本记录" sheet @close="$emit('close')">
    <p class="info-note">历史内容独立保留，讨论将绑定你选择的版本。</p>
    <div class="stack section">
      <details
        v-for="(version, index) in props.versions.toReversed()"
        :key="version.id"
        class="version-row"
      >
        <summary>
          <span>v{{ version.number }} · {{ version.label }}</span>
          <span class="badge">{{ index === 0 ? '当前版本' : '历史版本' }}</span>
        </summary>
        <p class="version-date">{{ version.createdAt.slice(0, 10) }}</p>
        <MathFormula
          :latex="version.latex"
          tabindex="0"
          role="group"
          :aria-label="'版本 ' + version.number + ' 公式，可横向滚动'"
        />
        <NuxtLink :to="version.to" class="text-button">
          讨论这个版本
          <AppIcon name="chevron" :size="14" />
        </NuxtLink>
      </details>
    </div>
  </AppModal>
</template>
<style scoped>
.version-row {
  min-width: 0;
  padding: 16px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
}
summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 44px;
  font-size: 14px;
  cursor: pointer;
}
.version-date {
  font-size: 12px;
  margin: 12px 0;
  color: var(--color-text-secondary);
}
</style>
