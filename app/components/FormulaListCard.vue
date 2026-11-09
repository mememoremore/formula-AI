<script setup lang="ts">
import { displayFormulaTitle } from '#shared/formula-title'

const props = withDefaults(
  defineProps<{
    title: string
    latex: string
    to: string
    category?: string
    favorite: boolean
    createdAt: string
    imageSrc?: string
    sourceLabel?: string
    sample?: boolean
    busy?: boolean
    editableCategory?: boolean
    compact?: boolean
  }>(),
  { category: '未分类', sourceLabel: '已保存公式' },
)

const emit = defineEmits<{ favorite: []; category: [] }>()

let pointerStart: { x: number; y: number } | undefined

function pointerDown(event: PointerEvent) {
  pointerStart = { x: event.clientX, y: event.clientY }
}

function openDetails(event: MouseEvent | KeyboardEvent) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    return

  const target = event.target as Element | null

  if (target?.closest('a, button, .category-tag')) return
  if (
    'clientX' in event &&
    pointerStart &&
    Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 8
  )
    return
  if (window.getSelection()?.toString()) return
  void navigateTo(props.to)
}

function date(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}
</script>
<template>
  <article
    class="card formula-list-card"
    :class="{ compact }"
    @pointerdown="pointerDown"
    @click="openDetails"
    @keydown.enter="openDetails"
  >
    <div class="formula-card-heading">
      <button
        v-if="editableCategory"
        class="category-tag"
        :aria-label="'修改' + displayFormulaTitle(title) + '的分类'"
        @click="emit('category')"
      >
        <span class="category-badge">
          {{ category }}
          <AppIcon name="pencil" :size="11" />
        </span>
      </button>
      <span v-else class="category-tag">
        <span class="category-badge">{{ category }}</span>
      </span>
      <FavoriteButton
        :active="favorite"
        :label="(favorite ? '取消收藏' : '收藏') + displayFormulaTitle(title)"
        :disabled="busy"
        @toggle="emit('favorite')"
      />
    </div>
    <NuxtLink :to="to" :aria-label="'查看' + displayFormulaTitle(title)" class="formula-card-body">
      <div class="formula-card-title">
        <h3>{{ displayFormulaTitle(title) }}</h3>
        <time :datetime="createdAt">{{ date(createdAt) }}</time>
      </div>
      <div class="formula-card-meta">
        <div>
          <p v-if="sourceLabel">{{ sourceLabel }}</p>
        </div>
      </div>
    </NuxtLink>
    <MathFormula
      class="card-latex"
      :latex="latex"
      tabindex="0"
      role="group"
      :aria-label="displayFormulaTitle(title) + '，公式可横向滚动'"
    />
  </article>
</template>
<style scoped>
.formula-list-card {
  cursor: pointer;
  min-width: 0;
  padding: 8px 16px 12px;
  border: 1px solid #eeebf4;
}
.formula-card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 3px;
}
.category-tag {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  max-width: calc(100% - 56px);
  padding: 0;
  border: 0;
  background: transparent;
  overflow-wrap: anywhere;
}
button.category-tag {
  min-height: 44px;
}
.category-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 8px;
  background: #efeaff;
  color: var(--color-primary);
  font-size: 12px;
}
.card-latex:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
h3 {
  font-size: 15px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.formula-card-body {
  display: block;
  min-width: 0;
}
.card-latex {
  padding: 4px 0 0;
}
.formula-card-body :deep(.katex-display) {
  margin: 0;
}
.formula-card-meta {
  display: flex;
  align-items: center;
  gap: 13px;
}
.formula-card-meta > div {
  flex: 1;
  min-width: 0;
}
.formula-card-meta p,
time {
  font-size: 11px;
  line-height: 1.8;
  color: var(--color-text-secondary);
}
time {
  display: block;
  margin-top: 4px;
}
.compact {
  padding: 14px 18px;
}
.compact .formula-card-meta {
  display: none;
}
.compact .formula-card-body :deep(.card-latex) {
  padding-block: 12px;
}
.formula-card-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.formula-card-title h3 {
  min-width: 0;
}
.formula-card-title time {
  flex-shrink: 0;
  font-size: 12px;
  margin: 0;
}
.card-latex :deep(.katex-display) {
  margin: 0.35em 0;
}
@media (max-width: 360px) {
  .formula-card-title {
    flex-wrap: wrap;
    gap: 0 10px;
  }
}
</style>
