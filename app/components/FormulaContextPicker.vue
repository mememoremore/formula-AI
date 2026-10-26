<script setup lang="ts">
import type { FormulaLibraryPage, FormulaLibraryItem } from '#shared/types/library'
const emit = defineEmits<{ close: []; selected: [formula: FormulaLibraryItem] }>()
const query = ref('')
const { data, error, status, refresh } = await useFetch<FormulaLibraryPage>(
  '/api/account/library',
  { key: 'chat-formula-picker', query: { q: query } },
)
</script>
<template>
  <AppModal :open="true" title="选择对话中的公式" @close="emit('close')">
    <label class="sr-only" for="context-search">搜索库中公式</label>
    <input
      id="context-search"
      v-model="query"
      class="input"
      type="search"
      maxlength="200"
      placeholder="搜索公式"
    />
    <div v-if="error" class="status-panel" role="alert">
      公式暂时无法读取。
      <button class="text-button" @click="refresh()">重试</button>
    </div>
    <p v-else-if="status === 'pending'" class="info-note section" role="status">正在查找公式…</p>
    <div v-else class="stack section">
      <button
        v-for="formula in data?.items"
        :key="formula.id"
        class="card context-option"
        @click="emit('selected', formula)"
      >
        <span>{{ formula.title }}</span>
        <MathFormula :latex="formula.latex" :display="false" />
        <AppIcon name="plus" :size="16" />
      </button>
      <p v-if="!data?.items.length" class="info-note">没有匹配的公式，试试其他关键词。</p>
    </div>
  </AppModal>
</template>
<style scoped>
.context-option {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-border);
  text-align: left;
  font-size: 13px;
}
.context-option span {
  flex: 1;
  min-width: 100px;
  overflow-wrap: anywhere;
}
</style>
