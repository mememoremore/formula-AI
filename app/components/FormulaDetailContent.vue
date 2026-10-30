<script setup lang="ts">
const props = defineProps<{
  title: string
  latex: string
  version: number
  versionCount: number
  imageSrc?: string
  originalLatex?: string
  sample?: boolean
  manual?: boolean
  badge?: string
  needsName?: boolean
  deletable?: boolean
}>()
const emit = defineEmits<{ edit: []; versions: []; remove: [] }>()
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
      <p class="detail-kicker">保留每一步，理解每一式</p>
      <h2>{{ title }}</h2>
      <button v-if="needsName" type="button" class="text-button" @click="emit('edit')">
        命名公式
      </button>
      <div class="detail-meta">
        <span v-if="versionCount > 1" class="badge">当前版本 · v{{ version }}</span>
        <span v-if="badge" class="detail-badge">{{ badge }}</span>
      </div>
      <slot name="organization" />
    </header>
    <section class="detail-reading" aria-label="公式与原图">
      <div class="detail-tabs" aria-label="公式展示">
        <button
          class="chip"
          :class="{ active: !original }"
          :aria-pressed="!original"
          @click="original = false"
        >
          数学公式
        </button>
        <button
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
            {{
              manual
                ? '手动输入，未上传原图；这里保留首个已保存版本。'
                : '预置公式示例，并非上传原图'
            }}
          </p>
        </template>
        <p v-else class="info-note">原图暂时不可用，已保存的公式不受影响。</p>
      </div>
      <TextCopyAction :text="latex" label="复制 LaTeX" success-message="LaTeX 已复制。" />
      <WordUseGuide />
      <details class="card latex-card">
        <summary>
          LaTeX 代码
          <AppIcon name="chevron" :size="15" />
        </summary>
        <code>{{ latex }}</code>
      </details>
    </section>
    <section class="detail-tools" aria-label="公式操作">
      <div class="card menu-list">
        <button class="menu-item" @click="emit('edit')">
          <AppIcon name="pencil" :size="18" />
          <span>编辑公式</span>
          <span v-if="versionCount > 1" class="menu-chevron text-small">v{{ version }}</span>
          <AppIcon name="chevron" :size="15" />
        </button>
        <button class="menu-item" @click="emit('versions')">
          <AppIcon name="history" :size="18" />
          <span>版本记录</span>
          <span class="menu-chevron text-small">{{ versionCount }} 个版本</span>
          <AppIcon name="chevron" :size="15" />
        </button>
        <button v-if="deletable" class="menu-item danger-item" @click="emit('remove')">
          <AppIcon name="trash" :size="18" />
          <span>删除公式</span>
          <AppIcon name="chevron" :size="15" />
        </button>
      </div>
      <div class="detail-actions"><slot name="actions" /></div>
      <div class="info-note detail-note"><slot name="note" /></div>
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
  margin-bottom: 24px;
}
.detail-kicker {
  font-size: 12px;
  color: var(--color-primary);
  margin-bottom: 10px;
}
.detail-title h2 {
  font-size: 28px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  letter-spacing: -0.6px;
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}
.detail-badge {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.detail-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}
.detail-tabs .chip {
  min-height: 44px;
  min-width: 100px;
}
.detail-paper {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  min-height: 206px;
  padding: 28px 16px 18px;
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
  .formula-detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  .detail-paper {
    padding: 40px 24px 24px;
  }
  .detail-tools {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
  .detail-actions {
    margin-top: 0;
  }
  .detail-note {
    grid-column: 1 / -1;
    margin-top: 0;
  }
}
</style>
