<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'
import { workspaceFeedback } from '~/utils/workspace-feedback'

const props = withDefaults(
  defineProps<{
    formulaId: string
    currentCategoryId: string | null
    title?: string
    confirmLabel?: string
  }>(),
  { title: '整理到分类', confirmLabel: '保存分类' },
)
const emit = defineEmits<{ close: []; saved: [formula: SavedFormula] }>()
const { data: categories, error, status, refresh } = useAccountCategories()
const selected = ref(props.currentCategoryId ?? '')
const mutation = useFormulaCategoryMutation()
const saving = mutation.busy
const feedback = ref('')

async function save() {
  if (saving.value || status.value === 'pending' || error.value) return
  feedback.value = ''
  try {
    const formula = await mutation.execute({
      id: props.formulaId,
      categoryId: selected.value || null,
    })

    emit('saved', formula)
    emit('close')
  } catch (error) {
    if (isAccountWriteCancelled(error)) return
    feedback.value = workspaceFeedback(error)
  }
}
</script>

<template>
  <AppModal :open="true" :title="title" @close="!saving && emit('close')">
    <form class="stack" @submit.prevent="save">
      <p class="info-note">为这条公式选择一个分类，也可以保留为未分类。</p>
      <fieldset class="category-fieldset" :disabled="saving || status === 'pending' || !!error">
        <legend class="field-label">公式分类</legend>
        <div class="category-options">
          <label :class="{ selected: selected === '' }">
            <input v-model="selected" class="sr-only" type="radio" value="" />
            <span>未分类</span>
            <AppIcon v-if="selected === ''" name="check" :size="17" />
          </label>
          <label
            v-for="category in categories?.items"
            :key="category.id"
            :class="{ selected: selected === category.id }"
          >
            <input v-model="selected" class="sr-only" type="radio" :value="category.id" />
            <span>{{ category.name }}</span>
            <AppIcon v-if="selected === category.id" name="check" :size="17" />
          </label>
        </div>
      </fieldset>
      <p v-if="status === 'pending'" class="info-note" role="status">正在读取分类…</p>
      <template v-if="error">
        <p class="error-text" role="alert">分类暂时无法读取，请重试。</p>
        <button type="button" class="text-button" @click="refresh()">重新加载分类</button>
      </template>
      <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
      <button
        type="submit"
        class="button button-primary"
        :disabled="saving || status === 'pending' || !!error"
      >
        {{ saving ? '正在保存…' : confirmLabel }}
      </button>
    </form>
  </AppModal>
</template>

<style scoped>
.category-fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.category-options {
  display: grid;
  gap: 8px;
  max-height: min(320px, 42dvh);
  margin-top: 10px;
  padding: 2px;
  overflow-y: auto;
}
.category-options label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface);
  cursor: pointer;
}
.category-options label:hover {
  border-color: var(--color-primary);
}
.category-options label.selected {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.category-options label:focus-within {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
.category-options span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.category-options .app-icon {
  flex-shrink: 0;
}
</style>
