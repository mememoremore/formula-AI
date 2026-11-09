<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'

const props = withDefaults(
  defineProps<{ formula: SavedFormula; placement?: 'favorite' | 'library' }>(),
  { placement: 'library' },
)
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
  <FavoriteButton
    v-if="placement === 'favorite'"
    :active="formula.favorite"
    :label="formula.favorite ? '取消收藏这条公式' : '收藏这条公式'"
    :disabled="busy"
    :aria-busy="busy"
    @toggle="favorite"
  />
  <button
    v-else
    class="button button-primary button-block add-to-library"
    @click="showCategories = true"
  >
    添加到公式库
  </button>
  <AccountCategoryPicker
    v-if="showCategories"
    :formula-id="formula.id"
    :current-category-id="formula.category?.id ?? null"
    title="添加到公式库"
    confirm-label="添加"
    @close="showCategories = false"
    @saved="emit('saved', $event)"
  />
</template>

<style scoped>
.add-to-library {
  margin-top: 18px;
}
</style>
