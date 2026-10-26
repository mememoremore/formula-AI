<script setup lang="ts">
import { libraryView } from '#shared/navigation'
const route = useRoute()
defineProps<{ filterable?: boolean; filtered?: boolean }>()
defineEmits<{ filter: [] }>()
const options = [
  { id: 'all', label: '全部' },
  { id: 'favorites', label: '收藏' },
  { id: 'recent', label: '最近识别' },
] as const
</script>
<template>
  <nav class="library-views" aria-label="公式库视图">
    <NuxtLink
      v-for="view in options"
      :key="view.id"
      :to="{
        path: '/library',
        query: {
          ...route.query,
          ...(view.id === 'recent' ? { q: undefined, category: undefined } : {}),
          view: view.id === 'all' ? undefined : view.id,
        },
      }"
      replace
      :class="{ active: libraryView(route.query.view) === view.id }"
      :aria-current="libraryView(route.query.view) === view.id ? 'page' : undefined"
    >
      {{ view.label }}
    </NuxtLink>
    <button v-if="filterable" class="filter-button" :class="{ filtered }" aria-label="筛选与管理分类" @click="$emit('filter')"><AppIcon name="filter" :size="21" /></button>
  </nav>
</template>
<style scoped>
.library-views {
  display: flex;
  gap: 10px;
  margin: 22px 0 26px;
}
a {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  min-height: 44px;
  border: 1px solid #eae6f4;
  border-radius: 24px;
  font-size: 14px;
  background: #ffffff80;
  color: var(--color-text);
}
.filter-button { display:grid; place-items:center; flex:0 0 42px; height:44px; margin-left:8px; border:0; border-radius:14px; background:white; color:#66638d; box-shadow:0 3px 14px #6257e507; }
.filter-button.filtered { background:#e9e2ff; color:var(--color-primary); }
a.active {
  color: var(--color-primary);
  background: #eae5ff;
  border-color: #eae5ff;
  font-weight: 600;
}
</style>
