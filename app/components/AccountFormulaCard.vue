<script setup lang="ts">
import { displayFormulaTitle } from '#shared/formula-title'
import type { FormulaLibraryItem } from '#shared/types/library'
const props = defineProps<{ formula: FormulaLibraryItem }>()
const emit = defineEmits<{
  favorite: [id: string, active: boolean]
  categorize: [formula: FormulaLibraryItem]
}>()
const { busy, setFavorite } = useAccountFavorite()
async function toggle() {
  const value = await setFavorite(props.formula.id, !props.formula.favorite)
  if (value !== null) emit('favorite', props.formula.id, value)
}
</script>
<template>
  <FormulaListCard
    :title="displayFormulaTitle(formula.title, !!formula.imageId)"
    :latex="formula.latex"
    :to="'/formulas/' + formula.id"
    :category="formula.category?.name"
    :favorite="formula.favorite"
    :created-at="formula.createdAt"
    :image-src="formula.imageId ? '/api/account/files/' + formula.imageId + '/content' : undefined"
    :source-label="formula.isMock ? '模拟识别结果' : ''"
    :busy="busy"
    editable-category
    @favorite="toggle"
    @category="emit('categorize', formula)"
  />
</template>
