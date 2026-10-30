<script setup lang="ts">
import type { CategoryCollection } from '#shared/types/library'
import type { SavedFormula } from '#shared/types/workspace'
import { workspaceFeedback } from '~/utils/workspace-feedback'
const props = defineProps<{ formulaId: string; currentCategoryId: string | null }>()
const emit = defineEmits<{ close: []; saved: [formula: SavedFormula] }>()
const {
  data: categories,
  error,
  status,
  refresh,
} = useFetch<CategoryCollection>('/api/account/categories', { key: 'account-categories' })
const selected = ref(props.currentCategoryId ?? '')
const saving = ref(false)
const feedback = ref('')
const controller = new AbortController()
let disposed = false
onScopeDispose(() => {
  disposed = true
  controller.abort()
})
async function save() {
  if (saving.value || status.value === 'pending' || error.value) return
  saving.value = true
  feedback.value = ''
  try {
    const formula = await $fetch<SavedFormula>(
      `/api/account/formulas/${props.formulaId}/category`,
      {
        method: 'PUT',
        body: { categoryId: selected.value || null },
        retry: 0,
        timeout: 15_000,
        signal: controller.signal,
      },
    )
    if (disposed) return
    emit('saved', formula)
    emit('close')
  } catch (error) {
    if (disposed) return
    feedback.value = workspaceFeedback(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal :open="true" title="整理到分类" @close="!saving && emit('close')">
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
        {{ saving ? '正在保存…' : '保存分类' }}
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
