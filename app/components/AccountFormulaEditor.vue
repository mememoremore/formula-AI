<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'
import { errorMessage } from '~/utils/error-message'

const props = defineProps<{ open: boolean; formula: SavedFormula }>()
const emit = defineEmits<{ close: []; saved: [formula: SavedFormula] }>()
const title = ref('')
const latex = ref('')
const expectedVersionId = ref('')
const saving = ref(false)
const feedback = ref('')
watch(
  () => props.open,
  (open) => {
    if (!open) return
    title.value = props.formula.title
    latex.value = props.formula.versions.at(-1)?.latex ?? ''
    expectedVersionId.value = props.formula.versions.at(-1)?.id ?? ''
    feedback.value = ''
  },
)
function close() {
  if (saving.value) return
  const changed =
    title.value !== props.formula.title || latex.value !== props.formula.versions.at(-1)?.latex
  if (!changed || window.confirm('公式修改尚未保存，确定放弃吗？')) emit('close')
}
async function save() {
  if (saving.value) return
  saving.value = true
  feedback.value = ''
  try {
    const formula = await $fetch<SavedFormula>(
      `/api/account/formulas/${props.formula.id}/versions`,
      {
        method: 'POST',
        retry: 0,
        timeout: 20000,
        body: {
          title: title.value,
          latex: latex.value,
          expectedVersionId: expectedVersionId.value,
        },
      },
    )
    emit('saved', formula)
    emit('close')
  } catch (error) {
    feedback.value = errorMessage(error, '保存失败，请检查网络后重试。')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal :open="open" title="编辑公式" sheet @close="close">
    <form class="stack" :aria-busy="saving" @submit.prevent="save">
      <label>
        <span class="field-label">公式名称</span>
        <input v-model="title" class="input" maxlength="100" required :disabled="saving" />
      </label>
      <label>
        <span class="field-label">LaTeX</span>
        <textarea
          v-model="latex"
          class="input latex-editor"
          maxlength="5000"
          required
          spellcheck="false"
          :disabled="saving"
        />
      </label>
      <div class="editor-preview"><MathFormula :latex="latex" /></div>
      <p class="info-note">确认后保存到账号，原始识别版本会保留。</p>
      <p v-if="feedback" class="error-text" role="alert">
        {{ feedback }} 发生版本冲突时，请先保留草稿，再关闭编辑并重新加载。
      </p>
      <button class="button button-primary" type="submit" :disabled="saving">
        {{ saving ? '正在保存…' : '确认并保存' }}
      </button>
    </form>
  </AppModal>
</template>

<style scoped>
.latex-editor {
  min-height: 130px;
  font:
    12px/1.8 Consolas,
    monospace;
}
.editor-preview {
  padding: 12px;
  background: var(--color-background);
  border-radius: 12px;
}
</style>
