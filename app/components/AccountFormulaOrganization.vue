<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'
const props = defineProps<{ formula: SavedFormula }>()
const emit = defineEmits<{ saved: [formula: SavedFormula] }>()
const { busy, setFavorite } = useAccountFavorite()
const showCategories = ref(false)
async function favorite() {
  const formula = props.formula
  const active = await setFavorite(formula.id, !formula.favorite)
  if (active !== null && props.formula.id === formula.id)
    emit('saved', { ...props.formula, favorite: active })
}
</script>

<template>
  <div class="formula-organization">
    <button class="text-button organization-category" @click="showCategories = true">
      <AppIcon name="book" :size="15" />
      <span>{{ formula.category?.name ?? '未分类' }}</span>
      <AppIcon name="pencil" :size="12" />
    </button>
    <FavoriteButton
      :active="formula.favorite"
      :label="formula.favorite ? '取消收藏这条公式' : '收藏这条公式'"
      :disabled="busy"
      :aria-busy="busy"
      @toggle="favorite"
    />
  </div>
  <AccountCategoryPicker
    v-if="showCategories"
    :formula-id="formula.id"
    :current-category-id="formula.category?.id ?? null"
    @close="showCategories = false"
    @saved="emit('saved', $event)"
  />
</template>

<style scoped>
.formula-organization {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 10px 0;
  gap: 15px;
}
.organization-category {
  max-width: 80%;
  min-height: var(--control-hit-area);
  color: var(--color-text-secondary);
}
.organization-category span {
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: left;
}
.organization-category svg {
  flex-shrink: 0;
}
</style>
