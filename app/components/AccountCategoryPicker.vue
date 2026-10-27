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
    clearNuxtData(`saved-formula-${props.formulaId}`)
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
      <label>
        <span class="field-label">公式分类</span>
        <select
          v-model="selected"
          class="input"
          :disabled="saving || status === 'pending' || !!error"
        >
          <option value="">未分类</option>
          <option v-for="category in categories?.items" :key="category.id" :value="category.id">
            {{ category.name }}
          </option>
        </select>
      </label>
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
