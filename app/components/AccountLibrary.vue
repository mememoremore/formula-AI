<script setup lang="ts">
import type { FormulaLibraryItem } from '#shared/types/library'
import { workspaceFeedback } from '~/utils/workspace-feedback'

const props = defineProps<{ kind: 'library' | 'favorites'; ownerId: string }>()
const route = useRoute()
const favoritesOnly = props.kind === 'favorites'
const listing = useAccountLibrary(props.kind, props.ownerId)
const { items, error, status, nextCursor, loadingMore, refreshing, feedback } = listing
const categoryRequest = useAccountCategories(toRef(props, 'ownerId'), favoritesOnly)
const { data: categories, error: categoryError } = categoryRequest
const { activeCategory, selectCategory } = useLibraryFilters()
const showManager = ref(false)
const selectedFormula = ref<FormulaLibraryItem | null>(null)
const managing = ref(false),
  selected = ref<string[]>([]),
  confirmOpen = ref(false),
  pendingDelete = ref<string[]>([]),
  deleteError = ref('')
const deletion = useFormulaBatchDeleteMutation(),
  deleting = deletion.busy
const { showToast } = useToast()

watch(items, (records) => {
  const visible = new Set(records.map((item) => item.id))

  selected.value = selected.value.filter((id) => visible.has(id))
})
watch([activeCategory, () => route.query.q], () => {
  managing.value = false
  selected.value = []
})

function toggleManager() {
  if (deleting.value) return
  managing.value = !managing.value
  selected.value = []
}

function selectAll() {
  selected.value = items.value.slice(0, 100).map((item) => item.id)
}

function selectFormula(event: MouseEvent, id: string) {
  if (!managing.value || (event.target as HTMLElement).closest('.formula-select')) return
  event.preventDefault()
  event.stopPropagation()
  if (deleting.value) return
  if (selected.value.includes(id)) selected.value = selected.value.filter((value) => value !== id)
  else if (selected.value.length < 100) selected.value.push(id)
}

function askDelete() {
  pendingDelete.value = [...selected.value]
  deleteError.value = ''
  confirmOpen.value = true
}

async function confirmDelete() {
  if (deleting.value || !pendingDelete.value.length) return
  deleteError.value = ''
  try {
    await deletion.execute(pendingDelete.value)
    confirmOpen.value = false
    managing.value = false
    selected.value = []
    showToast('已删除所选公式。')
  } catch (cause) {
    if (!isAccountWriteCancelled(cause))
      deleteError.value = workspaceFeedback(cause, '暂时无法删除，请重试。')
  }
}

const categoryFilters = computed(() => [
  {
    id: '',
    name: '全部',
    count: categories.value?.totalCount ?? 0,
  },
  { id: 'uncategorized', name: '未分类', count: categories.value?.uncategorizedCount ?? 0 },
  ...(categories.value?.items.map((item) => ({
    id: item.id,
    name: item.name,
    count: item.formulaCount,
  })) ?? []),
])
const heading = computed(() =>
  activeCategory.value
    ? (categoryFilters.value.find((item) => item.id === activeCategory.value)?.name ?? '分类结果')
    : favoritesOnly
      ? '已收藏的公式'
      : '全部',
)

watch(
  () => categories.value?.items,
  () => {
    ensureActiveCategory()
  },
)

function ensureActiveCategory() {
  if (
    !categoryRequest.error.value &&
    categories.value &&
    activeCategory.value &&
    activeCategory.value !== 'uncategorized' &&
    !categories.value?.items.some((item) => item.id === activeCategory.value)
  )
    void selectCategory('')
}

await Promise.all([listing.ready, categoryRequest.ready])
</script>

<template>
  <section class="section">
    <div class="section-heading">
      <h2>我的分类</h2>
      <button
        class="text-button manage-button"
        :disabled="!!categoryError"
        @click="showManager = true"
      >
        <AppIcon name="pencil" :size="13" />
        管理分类
      </button>
    </div>
    <div v-if="categoryError" class="library-error" role="alert">
      <p>分类暂时无法读取。</p>
      <button class="text-button" @click="categoryRequest.refresh()">重新加载分类</button>
    </div>
    <div v-else class="category-filters">
      <button
        v-for="category in categoryFilters"
        :key="category.id"
        :class="{ selected: activeCategory === category.id }"
        :aria-pressed="activeCategory === category.id"
        @click="selectCategory(category.id)"
      >
        <span class="category-chip">
          <span>{{ category.name }}</span>
          <small>{{ category.count }}</small>
        </span>
      </button>
    </div>
  </section>
  <section class="section" :aria-busy="status === 'pending' || refreshing">
    <div class="section-heading">
      <h2>{{ heading }}</h2>
      <div class="row">
        <button
          class="text-button manage-button formula-manager"
          :disabled="deleting"
          @click="toggleManager"
        >
          <AppIcon :name="managing ? 'close' : 'pencil'" :size="13" />
          {{ managing ? '取消管理' : '管理公式' }}
        </button>
      </div>
    </div>
    <BulkSelectionBar
      v-if="managing"
      :count="selected.length"
      :busy="deleting"
      :available="items.length"
      @select-all="selectAll"
      @remove="askDelete"
    >
      <template #actions>
        <StudySheetExport :ids="selected" :disabled="deleting" compact />
      </template>
    </BulkSelectionBar>
    <div v-if="error" class="card library-error" role="alert">
      <p>暂时无法读取公式，请重试或重新选择分类。</p>
      <div class="row">
        <button
          class="text-button"
          :disabled="status === 'pending' || loadingMore"
          @click="listing.reload"
        >
          重新加载
        </button>
      </div>
    </div>
    <div v-else-if="status === 'pending'" class="card library-loading" role="status">
      正在查找你的公式…
    </div>
    <template v-else>
      <LibraryGrid v-if="items.length">
        <div
          v-for="formula in items"
          :key="formula.id"
          class="managed-formula"
          :class="{ selectable: managing, 'is-selected': selected.includes(formula.id) }"
          @click.capture="selectFormula($event, formula.id)"
        >
          <label v-if="managing" class="formula-select">
            <input
              v-model="selected"
              type="checkbox"
              :value="formula.id"
              :disabled="deleting || (selected.length >= 100 && !selected.includes(formula.id))"
              :aria-label="'选择公式：' + formula.title"
            />
          </label>
          <div v-if="managing" class="card managed-preview">
            <MathFormula :latex="formula.latex" />
          </div>
          <AccountFormulaCard v-else :formula="formula" @categorize="selectedFormula = $event" />
        </div>
      </LibraryGrid>
      <EmptyState
        v-else
        :title="
          nextCursor
            ? '当前页已整理完成'
            : route.query.q || activeCategory
              ? '没有找到匹配的公式'
              : favoritesOnly
                ? '还没有收藏公式'
                : '从第一条公式开始'
        "
        :description="
          nextCursor
            ? '还有其他公式，可以继续加载。'
            : route.query.q || activeCategory
              ? '试试其他关键词，或切换到全部分类。'
              : favoritesOnly
                ? '点击公式旁的爱心，常用公式就会留在这里。'
                : '图片识别或手动输入公式后，所有公式均显示在这里'
        "
        :action-label="nextCursor ? undefined : favoritesOnly ? '浏览公式库' : '上传公式图片'"
        :action-to="nextCursor ? undefined : favoritesOnly ? '/library' : '/upload'"
      />
      <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
      <button
        v-if="nextCursor"
        class="button button-secondary button-block section"
        :disabled="loadingMore"
        @click="listing.loadMore"
      >
        {{ loadingMore ? '正在加载…' : '加载更多' }}
      </button>
    </template>
  </section>
  <AccountCategoryManager
    v-if="showManager"
    :categories="categories?.items ?? []"
    @close="showManager = false"
  />
  <AccountCategoryPicker
    v-if="selectedFormula"
    :formula-id="selectedFormula.id"
    :current-category-id="selectedFormula.category?.id ?? null"
    @close="selectedFormula = null"
  />
  <AppModal :open="confirmOpen" title="删除所选公式？" @close="!deleting && (confirmOpen = false)">
    <p>
      将删除
      {{ pendingDelete.length }}
      条公式，保存、分类和收藏中的同一公式会一起移除；已有对话和导出保留，可在“我的—回收站”恢复公式。
    </p>
    <p v-if="deleteError" class="error-text" role="alert">{{ deleteError }}</p>
    <div class="row formula-delete-actions">
      <button class="button button-secondary" :disabled="deleting" @click="confirmOpen = false">
        取消
      </button>
      <button class="button button-primary" :disabled="deleting" @click="confirmDelete">
        {{ deleting ? '删除中…' : '确认删除' }}
      </button>
    </div>
  </AppModal>
</template>

<style scoped>
.formula-manager {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
.managed-formula {
  position: relative;
  min-width: 0;
}
.managed-formula.is-selected {
  outline: 2px solid var(--color-primary);
  border-radius: var(--radius-card);
}
.managed-formula.selectable :deep(.formula-list-card) {
  padding-left: 46px;
}
.managed-preview {
  padding: 24px 18px 24px 46px;
  min-height: 100px;
  display: grid;
  align-items: center;
}
.formula-select {
  position: absolute;
  z-index: 1;
  top: 16px;
  left: 12px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
}
.formula-select input {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
}
.formula-delete-actions {
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}
.section {
  margin-top: 16px;
}
.section-heading {
  margin-bottom: 10px;
}
.section-heading h2 {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 14px;
  color: #554c66;
}
.section-heading .text-small {
  color: var(--color-text-secondary);
  font-size: 12px;
}
.manage-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--color-text-secondary);
}
.category-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.category-filters button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
}
.category-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 5px 9px;
  border: 1px solid #eae6f1;
  border-radius: 9px;
  color: var(--color-text-secondary);
  background: white;
  font-size: 11px;
}
.category-chip > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.category-filters button.selected .category-chip {
  border-color: #d9ccef;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}
.category-filters small {
  font-size: 12px;
  opacity: 0.7;
}
.library-loading,
.library-error {
  padding: 24px 20px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--color-muted);
}
.library-error .row {
  margin-top: 14px;
}
</style>
