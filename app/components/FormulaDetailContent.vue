<script setup lang="ts">
import { displayFormulaTitle } from '#shared/formula-title'

const props = defineProps<{
  title: string
  latex: string
  imageSrc?: string
  originalLatex?: string
  sample?: boolean
  manual?: boolean
  badge?: string
  needsName?: boolean
  deletable?: boolean
}>()
const emit = defineEmits<{ edit: []; remove: [] }>()
const imageFailed = ref(false)

watch(
  () => props.imageSrc,
  () => {
    imageFailed.value = false
  },
)
</script>
<template>
  <article class="formula-detail">
    <header class="detail-title">
      <div class="detail-heading">
        <h2>{{ displayFormulaTitle(title) }}</h2>
        <div v-if="$slots['title-actions']" class="detail-title-favorite">
          <slot name="title-actions" />
        </div>
        <div class="detail-heading-actions">
          <button
            v-if="needsName"
            type="button"
            class="text-button"
            aria-label="命名公式"
            @click="emit('edit')"
          >
            <AppIcon name="pencil" :size="15" />
            命名
          </button>
        </div>
      </div>
      <div v-if="badge" class="detail-meta">
        <span v-if="badge" class="detail-badge">{{ badge }}</span>
      </div>
      <slot name="organization" />
    </header>
    <section class="detail-reading" aria-label="公式与原图">
      <div v-if="!manual" class="detail-tabs">
        <strong>{{ sample ? '原始示例' : '原始图片' }}</strong>
        <div class="reading-actions"><slot name="reading-actions" /></div>
      </div>
      <div v-if="!manual" class="source-image">
        <img
          v-if="imageSrc && !imageFailed"
          :src="imageSrc"
          alt="识别时选择的公式原图"
          @error="imageFailed = true"
        />
        <MathFormula v-else-if="sample && originalLatex" :latex="originalLatex" />
        <p v-else class="info-note">原图暂时不可用，已保存的公式不受影响。</p>
      </div>
      <p class="field-label" style="margin-top: 14px">数学公式</p>
      <div class="paper-preview detail-paper">
        <MathFormula :latex="latex" tabindex="0" role="group" aria-label="数学公式，可横向滚动" />
      </div>
    </section>
    <section class="detail-tools" aria-label="公式操作">
      <details class="card latex-card">
        <summary>
          LaTeX 代码
          <AppIcon name="chevron" :size="15" />
        </summary>
        <code>{{ latex }}</code>
      </details>
      <div class="detail-toolbar">
        <button class="button button-white" @click="emit('edit')">
          <AppIcon name="pencil" :size="16" />
          编辑公式
        </button>
        <FormulaCopyAction :formulas="[latex]" />
        <div class="detail-actions"><slot name="actions" /></div>
      </div>
      <div v-if="$slots.note" class="info-note detail-note"><slot name="note" /></div>
    </section>
    <slot name="primary" />
    <slot name="footer" />
  </article>
</template>
<style scoped>
.formula-detail,
.detail-reading,
.detail-tools {
  min-width: 0;
}
.detail-title {
  margin-bottom: 12px;
}
.detail-kicker {
  font-size: 12px;
  color: var(--color-primary);
  margin-bottom: 10px;
}
.detail-title h2 {
  font-size: min(24px, var(--page-title-font-size, 24px));
  line-height: 1.45;
  overflow-wrap: anywhere;
  letter-spacing: -0.6px;
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}
.detail-badge {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.detail-tabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}
.reading-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
}
.reading-actions :deep(.text-button) {
  font-size: 13px;
  white-space: nowrap;
}
.detail-paper {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  min-height: 132px;
  padding: 16px;
  min-width: 0;
}
.source-image {
  display: grid;
  min-width: 0;
  place-items: center;
  min-height: 200px;
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: #fffcf7;
}
.source-image img {
  display: block;
  max-width: 100%;
  max-height: 460px;
  object-fit: contain;
}
.latex-card {
  min-width: 0;
  padding: 8px 18px;
  margin: 0 0 14px;
}
summary {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  font-size: 13px;
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
code {
  display: block;
  font:
    12px/1.9 Consolas,
    monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 12px 0;
  user-select: text;
}
.detail-tools {
  margin-top: 14px;
}
.detail-actions {
  margin-top: 24px;
}
.detail-note {
  margin-top: 20px;
  line-height: 1.9;
  color: var(--color-text-secondary);
}
@media (min-width: 900px) {
  .detail-paper {
    min-height: 160px;
  }
}
.detail-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}
.detail-heading h2 {
  min-width: 0;
}
.detail-title-favorite {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.detail-heading-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}
.detail-toolbar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  align-items: start;
}
.detail-toolbar > *,
.detail-actions {
  min-width: 0;
  margin: 0;
}
.detail-toolbar :deep(.button),
.detail-toolbar :deep(.text-copy-action > .text-button) {
  min-height: 44px;
  width: 100%;
  padding: 8px 5px;
  gap: 5px;
  font-size: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-control);
  color: var(--color-text);
  margin: 0;
}
.detail-toolbar > :has(.copy-fallback) {
  grid-column: 1 / -1;
}
details[open] > summary > .app-icon {
  transform: rotate(90deg);
}
.detail-note {
  font-size: 12px;
  margin-top: 8px;
}
</style>
