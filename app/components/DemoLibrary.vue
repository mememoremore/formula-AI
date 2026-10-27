<script setup lang="ts">
import { libraryView } from '#shared/navigation'
const route = useRoute()
const { formulas, categories, addCategory } = useDemoLibrary()
const { showToast } = useToast()
const { query, activeCategory: active, search, selectCategory: category } = useLibraryFilters(true)
const view = computed(() => libraryView(route.query.view))
const showNew = ref(false)
const name = ref('')
const error = ref('')
const filtered = computed(() =>
  formulas.value.filter((item) => {
    const text = query.value.trim().toLowerCase()
    return (
      (!active.value || item.categoryId === active.value) &&
      (view.value !== 'recent' || item.source === 'mock-recognition') &&
      (view.value !== 'favorites' || item.favorite) &&
      (!text || (item.title + ' ' + item.latex).toLowerCase().includes(text))
    )
  }),
)
function create() {
  if (!addCategory(name.value)) {
    error.value = '请输入不重复的分类名称。'
    return
  }
  showNew.value = false
  name.value = ''
  error.value = ''
  showToast('分类已添加到本机。')
}
</script>
<template>
  <LibrarySearch v-model="query" live @search="search" />
  <LibraryViews />
  <section>
    <div class="section-heading">
      <h2>分类</h2>
      <button class="text-button" @click="showNew = true">
        新建分类
        <AppIcon name="plus" :size="15" />
      </button>
    </div>
    <div class="chip-list">
      <button class="chip" :class="{ active: !active }" @click="category('')">全部分类</button>
      <button
        v-for="item in categories"
        :key="item.id"
        class="chip"
        :class="{ active: active === item.id }"
        @click="category(item.id)"
      >
        {{ item.name }}
      </button>
    </div>
  </section>
  <section class="section">
    <div class="section-heading">
      <h2>
        {{
          view === 'favorites'
            ? '留在手边的公式'
            : view === 'recent'
              ? '每一次识别，都有迹可循'
              : '最近整理'
        }}
      </h2>
      <span class="muted text-small">{{ filtered.length }} 条</span>
    </div>
    <LibraryGrid v-if="filtered.length">
      <FormulaCard v-for="formula in filtered" :key="formula.id" :formula="formula" />
    </LibraryGrid>
    <EmptyState
      v-else
      :title="
        view === 'recent'
          ? '还没有演示识别记录'
          : view === 'favorites'
            ? '还没有收藏公式'
            : '没有找到匹配的公式'
      "
      description="试试其他分类，或上传一张新的公式图片。"
    />
  </section>
  <AppModal :open="showNew" title="新建分类" @close="showNew = false">
    <form class="stack" @submit.prevent="create">
      <label>
        <span class="field-label">分类名称</span>
        <input v-model="name" class="input" maxlength="20" required placeholder="例如：离散数学" />
      </label>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <button class="button button-primary" type="submit">创建分类</button>
    </form>
  </AppModal>
</template>
<style scoped>
.chip:not(.active) {
  color: var(--color-text-secondary);
}
.chip {
  min-height: 44px;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
}
.section-heading h2 {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
