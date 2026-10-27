<script setup lang="ts">
import type { FormulaLibraryPage, FormulaLibraryItem } from '#shared/types/library'
const props = defineProps<{ ownerId: string }>()
const emit = defineEmits<{ close: []; selected: [formula: FormulaLibraryItem] }>()
const draft = ref(''),
  query = ref(''),
  fetcher = useRequestFetch()
const { data, error, status, refresh } = await useAsyncData(
  'chat-formula-picker-' + props.ownerId,
  async (_app, { signal }) => {
    const q = query.value,
      page = await fetcher<FormulaLibraryPage>('/api/account/library', {
        query: { q },
        signal,
        retry: 0,
        timeout: 15000,
      })
    signal.throwIfAborted()
    return { ...page, q }
  },
  { watch: [query], getCachedData: () => undefined },
)
const page = computed(() => (data.value?.q === query.value ? data.value : undefined))
const loading = ref(false),
  feedback = ref('')
let controller: AbortController | undefined,
  disposed = false
function cancel() {
  controller?.abort()
  controller = undefined
  loading.value = false
  feedback.value = ''
}
watch(query, cancel, { flush: 'sync' })
onScopeDispose(() => {
  disposed = true
  cancel()
})
async function more() {
  if (!page.value?.nextCursor || loading.value || status.value === 'pending') return
  const q = query.value,
    cursor = page.value.nextCursor,
    active = new AbortController()
  controller = active
  loading.value = true
  feedback.value = ''
  try {
    const next = await $fetch<FormulaLibraryPage>('/api/account/library', {
      query: { q, cursor },
      signal: active.signal,
      retry: 0,
      timeout: 15000,
    })
    if (disposed || active.signal.aborted || q !== query.value || !page.value) return
    const ids = new Set(page.value.items.map((item) => item.id))
    data.value = {
      ...page.value,
      items: [...page.value.items, ...next.items.filter((item) => !ids.has(item.id))],
      nextCursor: next.nextCursor,
    }
  } catch {
    if (!disposed && !active.signal.aborted)
      feedback.value = '加载后续公式失败，已有选择保留，请重试。'
  } finally {
    if (controller === active) {
      controller = undefined
      loading.value = false
    }
  }
}
</script>
<template>
  <AppModal :open="true" title="选择对话中的公式" @close="emit('close')">
    <form class="picker-search" role="search" @submit.prevent="query = draft.trim()">
      <label class="sr-only" for="context-search">搜索库中公式</label>
      <input
        id="context-search"
        v-model="draft"
        class="input"
        type="search"
        maxlength="200"
        placeholder="搜索公式"
      />
      <button class="icon-button" type="submit" aria-label="搜索公式">
        <AppIcon name="search" :size="18" />
      </button>
    </form>
    <div v-if="error" class="status-panel" role="alert">
      公式暂时无法读取。
      <button class="text-button" @click="refresh()">重试</button>
    </div>
    <p v-else-if="status === 'pending'" class="info-note section" role="status">正在查找公式…</p>
    <div v-else class="stack section">
      <button
        v-for="formula in page?.items"
        :key="formula.id"
        class="card context-option"
        @click="emit('selected', formula)"
      >
        <span>{{ formula.title }}</span>
        <MathFormula :latex="formula.latex" :display="false" />
        <AppIcon name="plus" :size="16" />
      </button>
      <p v-if="!page?.items.length" class="info-note">没有匹配的公式，试试其他关键词。</p>
    </div>
    <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
    <button
      v-if="page?.nextCursor && !error"
      class="button button-secondary button-block section"
      :disabled="loading || status === 'pending'"
      @click="more"
    >
      {{ loading ? '正在加载…' : '加载更多公式' }}
    </button>
  </AppModal>
</template>
<style scoped>
.picker-search {
  display: flex;
  gap: 8px;
  align-items: center;
}
.picker-search .input {
  min-width: 0;
}
.context-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-border);
  text-align: left;
  font-size: 14px;
  min-height: 64px;
}
.context-option span {
  overflow-wrap: anywhere;
}
.context-option :deep(.math-inline) {
  grid-row: 2;
  grid-column: 1/-1;
  max-width: 100%;
}
</style>
