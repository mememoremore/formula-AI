<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'
import { workspaceFeedback } from '~/utils/workspace-feedback'
import { formulaDraftFeedback, formulaDraftChanged } from '~/utils/formula-editor'
const props = defineProps<{ open: boolean; formula: SavedFormula }>()
const emit = defineEmits<{ close: []; saved: [formula: SavedFormula] }>()
const title = ref(''),
  latex = ref(''),
  expectedVersionId = ref('')
const original = ref({ title: '', latex: '' })
const saving = ref(false),
  feedback = ref('')
const open = toRef(props, 'open')
const dirty = computed(() =>
  formulaDraftChanged({ title: title.value, latex: latex.value }, original.value),
)
const validation = computed(() => formulaDraftFeedback(title.value, latex.value))
const { canLeave } = useFormulaDraftGuard(open, dirty, saving)
let controller: AbortController | undefined
let disposed = false
watch(
  open,
  (value) => {
    if (!value) return
    original.value = {
      title: props.formula.title,
      latex: props.formula.versions.at(-1)?.latex ?? '',
    }
    title.value = original.value.title
    latex.value = original.value.latex
    expectedVersionId.value = props.formula.versions.at(-1)?.id ?? ''
    feedback.value = ''
  },
  { immediate: true },
)
function close() {
  if (canLeave()) emit('close')
}
async function save() {
  if (saving.value || validation.value || !dirty.value) return
  saving.value = true
  feedback.value = ''
  const id = props.formula.id
  controller = new AbortController()
  try {
    const formula = await $fetch<SavedFormula>(`/api/account/formulas/${id}/versions`, {
      method: 'POST',
      retry: 0,
      timeout: 20_000,
      signal: controller.signal,
      body: { title: title.value, latex: latex.value, expectedVersionId: expectedVersionId.value },
    })
    if (disposed || props.formula.id !== id) return
    original.value = { title: formula.title, latex: formula.versions.at(-1)?.latex ?? '' }
    emit('saved', formula)
    emit('close')
  } catch (error) {
    if (disposed) return
    const conflict = (error as { statusCode?: number }).statusCode === 409
    feedback.value = conflict
      ? '公式已被其他窗口修改。草稿仍保留，请先复制草稿，再关闭编辑并重新加载。'
      : workspaceFeedback(error, '保存失败，草稿已保留，请检查网络后重试。')
  } finally {
    if (!disposed) saving.value = false
  }
}
onScopeDispose(() => {
  disposed = true
  controller?.abort()
})
</script>
<template>
  <AppModal :open="open" title="编辑公式" sheet @close="close">
    <form class="stack" :aria-busy="saving" @submit.prevent="save">
      <p class="info-note">
        正在编辑 v{{
          formula.versions.find((v) => v.id === expectedVersionId)?.number
        }}，原有版本会保留。
      </p>
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
          :aria-invalid="!!validation"
          :aria-describedby="validation ? 'account-draft-validation' : undefined"
        />
      </label>
      <div class="editor-preview">
        <p class="field-label">公式预览</p>
        <MathFormula :latex="latex" tabindex="0" aria-label="编辑预览，可横向滚动" />
      </div>
      <p v-if="validation" id="account-draft-validation" class="error-text" role="status">
        {{ validation }}
      </p>
      <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
      <div class="editor-actions">
        <button class="button button-white" type="button" :disabled="saving" @click="close">
          取消
        </button>
        <button
          class="button button-primary"
          type="submit"
          :disabled="saving || !!validation || !dirty"
        >
          {{ saving ? '正在保存…' : '确认并保存' }}
        </button>
      </div>
      <p class="info-note">保存前请核对名称与公式。历史内容不会被覆盖。</p>
    </form>
  </AppModal>
</template>
<style scoped>
.latex-editor {
  min-height: 150px;
  font:
    13px/1.8 Consolas,
    monospace;
}
.editor-preview {
  min-width: 0;
  padding: 16px;
  background: var(--color-background);
  border-radius: var(--radius-control);
}
.editor-actions {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
}
</style>
