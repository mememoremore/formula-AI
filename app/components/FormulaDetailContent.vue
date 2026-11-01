<script setup lang="ts">
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
const original = ref(false),
  imageFailed = ref(false)
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
        <h2>{{ title }}</h2>
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
      <div v-if="badge" class="detail-meta">
        <span v-if="badge" class="detail-badge">{{ badge }}</span>
      </div>
      <slot name="organization" />
    </header>
    <section class="detail-reading" aria-label="公式与原图">
      <div v-if="!manual" class="detail-tabs" aria-label="公式展示">
        <button
          class="chip"
          :class="{ active: !original }"
          :aria-pressed="!original"
          @click="original = false"
        >
          数学公式
        </button>
        <button
          v-if="!manual"
          class="chip"
          :class="{ active: original }"
          :aria-pressed="original"
          @click="original = true"
        >
          {{ manual ? '原始输入' : sample ? '原始示例' : '原始图片' }}
        </button>
      </div>
      <div v-if="!original" class="paper-preview detail-paper">
        <MathFormula :latex="latex" tabindex="0" role="group" aria-label="数学公式，可横向滚动" />
      </div>
      <div v-else class="source-image">
        <img
          v-if="imageSrc && !imageFailed"
          :src="imageSrc"
          alt="识别时选择的公式原图"
          @error="imageFailed = true"
        />
        <template v-else-if="(sample || manual) && originalLatex">
          <MathFormula
            :latex="originalLatex"
            tabindex="0"
            :aria-label="manual ? '原始输入公式，可横向滚动' : '原始示例公式，可横向滚动'"
          />
          <p class="info-note">
            {{ manual ? '手动输入，未上传原图。' : '预置公式示例，并非上传原图' }}
          </p>
        </template>
        <p v-else class="info-note">原图暂时不可用，已保存的公式不受影响。</p>
      </div>
    </section>
    <slot name="primary" />
    <section class="detail-tools" aria-label="公式操作">
      <div class="detail-toolbar">
        <button class="button button-white" @click="emit('edit')">
          <AppIcon name="pencil" :size="16" />
          编辑公式
        </button>
        <TextCopyAction :text="latex" label="复制 LaTeX" success-message="LaTeX 已复制。" />
        <div class="detail-actions"><slot name="actions" /></div>
      </div>
      <details class="card latex-card">
        <summary>
          LaTeX 代码
          <AppIcon name="chevron" :size="15" />
        </summary>
        <code>{{ latex }}</code>
      </details>
      <details v-if="deletable" class="more-tools">
        <summary>
          更多操作
          <AppIcon name="chevron" :size="15" />
        </summary>
        <button class="text-button danger-item" @click="emit('remove')">
          <AppIcon name="trash" :size="16" />
          删除公式
        </button>
      </details>
      <div v-if="$slots.note" class="info-note detail-note"><slot name="note" /></div>
    </section>
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
  font-size: 24px;
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
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}
.detail-tabs .chip {
  min-height: 44px;
  min-width: 100px;
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
  margin-top: 18px;
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
  margin-top: 24px;
}
.detail-actions {
  margin-top: 24px;
}
.detail-note {
  margin-top: 20px;
  line-height: 1.9;
  color: var(--color-text-secondary);
}
.danger-item {
  color: var(--color-danger);
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
  justify-content: space-between;
}
.detail-heading h2 {
  min-width: 0;
}
.detail-heading > button {
  flex-shrink: 0;
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
.more-tools {
  margin-top: 12px;
}
.more-tools summary {
  color: var(--color-text-secondary);
  justify-content: flex-start;
}
details[open] > summary > .app-icon {
  transform: rotate(90deg);
}
.detail-note {
  font-size: 12px;
  margin-top: 8px;
}
</style>
