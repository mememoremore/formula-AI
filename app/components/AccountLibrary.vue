<script setup lang="ts">
import type { CategoryCollection, FormulaLibraryItem } from '#shared/types/library'
const props = defineProps<{ kind: 'library' | 'favorites'; ownerId: string }>()
const route = useRoute()
const favoritesOnly = props.kind === 'favorites'
const listing = useAccountLibrary(props.kind, props.ownerId)
const { items, error, status, nextCursor, loadingMore, feedback } = listing
const categoryRequest = useFetch<CategoryCollection>('/api/account/categories', {
  key: 'account-categories',
})
const { data: categories, error: categoryError } = categoryRequest
const { query, activeCategory, search, selectCategory } = useLibraryFilters()
const showManager = ref(false)
const selectedFormula = ref<FormulaLibraryItem | null>(null)
const categoryFilters = computed(() => [
  { id: '', name: '全部', count: categories.value?.totalCount ?? 0 },
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
      : '最近保存',
)
async function categoriesChanged() {
  await categoryRequest.refresh()
  if (
    !categoryRequest.error.value &&
    categories.value &&
    activeCategory.value &&
    activeCategory.value !== 'uncategorized' &&
    !categories.value?.items.some((item) => item.id === activeCategory.value)
  )
    await selectCategory('')
  await listing.reload()
}
async function assigned() {
  selectedFormula.value = null
  await categoriesChanged()
}
await Promise.all([listing.ready, categoryRequest])
</script>

<template>
  <div class="section-heading">
    <NuxtLink class="text-button" to="/formulas/new">手动创建公式</NuxtLink>
  </div>
  <LibrarySearch v-model="query" @search="search" />
  <LibraryViews />
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
        <span>{{ category.name }}</span>
        <small>{{ category.count }}</small>
      </button>
    </div>
    <p v-if="favoritesOnly" class="filter-hint">分类数字为账号内的公式总数</p>
  </section>
  <section class="section" :aria-busy="status === 'pending'">
    <div class="section-heading">
      <h2>{{ heading }}</h2>
      <div class="row">
        <span class="text-small muted">{{ items.length }} 条已显示</span>
        <button
          class="text-button"
          :disabled="status === 'pending' || loadingMore"
          @click="listing.reload"
        >
          刷新
        </button>
      </div>
    </div>
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
        <AccountFormulaCard
          v-for="formula in items"
          :key="formula.id"
          :formula="formula"
          @favorite="listing.favoriteChanged"
          @categorize="selectedFormula = $event"
        />
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
                : '上传一张公式图片，把识别结果和修改版本保存到你的账号。'
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
  <p class="library-note">分类与收藏已保存到你的账号</p>
  <AccountCategoryManager
    v-if="showManager"
    :categories="categories?.items ?? []"
    @close="showManager = false"
    @changed="categoriesChanged"
  />
  <AccountCategoryPicker
    v-if="selectedFormula"
    :formula-id="selectedFormula.id"
    :current-category-id="selectedFormula.category?.id ?? null"
    @close="selectedFormula = null"
    @saved="assigned"
  />
</template>

<style scoped>
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
  gap: 7px;
  max-width: 100%;
  min-height: 44px;
  padding: 7px 12px;
  border: 1px solid #eae6f1;
  border-radius: 11px;
  color: var(--color-text-secondary);
  background: white;
  font-size: 11px;
}
.category-filters button span {
  overflow-wrap: anywhere;
}
.category-filters button.selected {
  border-color: #d9ccef;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}
.category-filters small {
  font-size: 12px;
  opacity: 0.7;
}
.filter-hint {
  color: #ada5b7;
  font-size: 12px;
  margin-top: 9px;
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
.library-note {
  margin-top: 27px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 12px;
}
</style>
