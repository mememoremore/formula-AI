<script setup lang="ts">
const props = defineProps<{
  title: string
  latex: string
  version: number
  versionCount: number
  imageSrc?: string
  originalLatex?: string
  sample?: boolean
  badge?: string
}>()
const emit = defineEmits<{ edit: []; versions: [] }>()
const original = ref(false),
  imageFailed = ref(false)
watch(
  () => props.imageSrc,
  () => {
    imageFailed.value = false
  },
)
const { showToast } = useToast()
async function copy() {
  try {
    await navigator.clipboard.writeText(props.latex)
    showToast('LaTeX 已复制。')
  } catch {
    showToast('复制不可用，请手动选择代码。')
  }
}
</script>
<template>
  <div class="detail-title">
    <h2>{{ title }}</h2>
    <span v-if="badge" class="badge">{{ badge }}</span>
  </div>
  <slot name="organization" />
  <div class="chip-list detail-tabs" aria-label="公式展示">
    <button
      class="chip"
      :class="{ active: !original }"
      :aria-pressed="!original"
      @click="original = false"
    >
      公式
    </button>
    <button
      class="chip"
      :class="{ active: original }"
      :aria-pressed="original"
      @click="original = true"
    >
      {{ sample ? '原始示例' : '原始图片' }}
    </button>
  </div>
  <div v-if="!original" class="paper-preview"><MathFormula :latex="latex" /></div>
  <div v-else class="source-image">
    <img
      v-if="imageSrc && !imageFailed"
      :src="imageSrc"
      alt="识别时选择的公式原图"
      @error="imageFailed = true"
    />
    <template v-else-if="sample && originalLatex">
      <MathFormula :latex="originalLatex" />
      <p class="info-note">预置公式示例，并非上传原图</p>
    </template>
    <p v-else class="info-note">原图暂时不可用，已保存的公式不受影响。</p>
  </div>
  <details class="card latex-card section">
    <summary>
      LaTeX 代码
      <AppIcon name="chevron" :size="15" />
    </summary>
    <code>{{ latex }}</code>
    <button class="text-button" @click="copy">
      <AppIcon name="copy" :size="14" />
      复制代码
    </button>
  </details>
  <div class="card menu-list section">
    <button class="menu-item" @click="emit('edit')">
      <AppIcon name="pencil" :size="18" />
      <span>编辑公式</span>
      <span class="menu-chevron text-small">v{{ version }}</span>
      <AppIcon name="chevron" :size="15" />
    </button>
    <button class="menu-item" @click="emit('versions')">
      <AppIcon name="history" :size="18" />
      <span>版本记录</span>
      <span class="menu-chevron text-small">{{ versionCount }} 个版本</span>
      <AppIcon name="chevron" :size="15" />
    </button>
  </div>
  <div class="section"><slot name="actions" /></div>
  <div class="info-note section"><slot name="note" /></div>
</template>
<style scoped>
.detail-title {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  justify-content: space-between;
}
.detail-title h2 {
  font-size: 26px;
  overflow-wrap: anywhere;
}
.detail-tabs {
  margin: 20px 0;
}
.detail-tabs .chip {
  min-width: 80px;
}
.source-image {
  display: grid;
  place-items: center;
  min-height: 180px;
  padding: 22px;
  border: 1px solid #ebe6dd;
  border-radius: 18px;
  background: #fffcf7;
}
.source-image img {
  display: block;
  max-width: 100%;
  max-height: 360px;
  object-fit: contain;
}
.latex-card {
  padding: 18px 20px;
}
summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.8;
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
  overflow-wrap: anywhere;
  margin-top: 18px;
  user-select: text;
}
</style>
