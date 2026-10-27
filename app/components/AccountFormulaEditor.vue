<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'
import { workspaceFeedback } from '~/utils/workspace-feedback'
import { formulaDraftFeedback, formulaDraftChanged } from '~/utils/formula-editor'
const props = defineProps<{ open: boolean; formula: SavedFormula }>()
const emit = defineEmits<{
  close: []
  saved: [formula: SavedFormula]
  reloaded: [formula: SavedFormula]
}>()
const title = ref(''),
  latex = ref(''),
  expectedVersionId = ref('')
const original = ref({ title: '', latex: '' })
const operation = ref<'save' | 'reload' | null>(null)
const busy = computed(() => operation.value !== null)
const feedback = ref('')
const conflicted = ref(false)
const open = toRef(props, 'open')
const dirty = computed(() =>
  formulaDraftChanged({ title: title.value, latex: latex.value }, original.value),
)
const validation = computed(() => formulaDraftFeedback(title.value, latex.value))
const { canLeave } = useFormulaDraftGuard(open, dirty, busy)
let controller: AbortController | undefined
let disposed = false
function fill(formula: SavedFormula) {
  original.value = { title: formula.title, latex: formula.versions.at(-1)?.latex ?? '' }
  title.value = original.value.title
  latex.value = original.value.latex
  expectedVersionId.value = formula.versions.at(-1)?.id ?? ''
  feedback.value = ''
  conflicted.value = false
}
watch(
  open,
  (value) => {
    if (!value) return
    fill(props.formula)
  },
  { immediate: true },
)
function close() {
  if (canLeave()) emit('close')
}
async function save() {
  if (busy.value || conflicted.value || validation.value || !dirty.value) return
  operation.value = 'save'
  feedback.value = ''
  const id = props.formula.id
  controller = new AbortController()
  try {
    const formula = await $fetch<SavedFormula>(`/api/account/formulas/${id}/versions`, {
      method: 'POST',
      retry: 0,
      timeout: 20_000,
      signal: controller.signal,
      body: {
        title: title.value,
        latex: latex.value,
        expectedVersionId: expectedVersionId.value,
        expectedTitle: original.value.title,
      },
    })
    if (disposed || props.formula.id !== id) return
    original.value = { title: formula.title, latex: formula.versions.at(-1)?.latex ?? '' }
    emit('saved', formula)
    emit('close')
  } catch (error) {
    if (disposed) return
    const conflict = (error as { statusCode?: number }).statusCode === 409
    conflicted.value = conflict
    feedback.value = conflict
      ? '公式名称或内容已被其他窗口修改。草稿仍保留，可先复制草稿，再重新读取最新内容。'
      : workspaceFeedback(error, '保存失败，草稿已保留，请检查网络后重试。')
  } finally {
    if (!disposed) operation.value = null
  }
}
async function copyDraft() {
  try {
    await navigator.clipboard.writeText(title.value + '\n\n' + latex.value)
    feedback.value = '草稿已复制。重新读取会替换当前编辑内容。'
  } catch {
    feedback.value = '复制不可用，请手动保留名称和 LaTeX；当前草稿未变。'
  }
}
async function reloadLatest() {
  if (busy.value || !canLeave()) return
  operation.value = 'reload'
  const id = props.formula.id
  controller = new AbortController()
  try {
    const formula = await $fetch<SavedFormula>(`/api/account/formulas/${id}`, {
      signal: controller.signal,
      retry: 0,
      timeout: 15_000,
    })
    if (disposed || props.formula.id !== id) return
    fill(formula)
    emit('reloaded', formula)
  } catch (error) {
    if (!disposed) feedback.value = workspaceFeedback(error, '读取失败，当前草稿仍保留，请重试。')
  } finally {
    if (!disposed) operation.value = null
  }
}
onScopeDispose(() => {
  disposed = true
  controller?.abort()
})
</script>
<template>
  <AppModal :open="open" title="编辑公式" sheet @close="close">
    <form class="stack" :aria-busy="busy" @submit.prevent="save">
      <p class="info-note">
        正在编辑 v{{
          formula.versions.find((v) => v.id === expectedVersionId)?.number
        }}，原有版本会保留。
      </p>
      <label>
        <span class="field-label">公式名称</span>
        <input v-model="title" class="input" maxlength="100" required :disabled="busy" />
      </label>
      <label>
        <span class="field-label">LaTeX</span>
        <textarea
          v-model="latex"
          class="input latex-editor"
          maxlength="5000"
          required
          spellcheck="false"
          :disabled="busy"
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
      <div v-if="conflicted" class="stack">
        <button class="text-button" type="button" :disabled="busy" @click="copyDraft">
          复制当前草稿
        </button>
        <button class="button button-white" type="button" :disabled="busy" @click="reloadLatest">
          {{ operation === 'reload' ? '正在读取…' : '重新读取最新内容' }}
        </button>
      </div>
      <div class="editor-actions">
        <button class="button button-white" type="button" :disabled="busy" @click="close">
          取消
        </button>
        <button
          class="button button-primary"
          type="submit"
          :disabled="busy || conflicted || !!validation || !dirty"
        >
          {{ operation === 'save' ? '正在保存…' : '确认并保存' }}
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
