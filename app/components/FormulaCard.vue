<script setup lang="ts">
import type { Formula } from '#shared/types/api'
const props = defineProps<{ formula: Formula; compact?: boolean }>()
const { toggleFavorite, categories } = useDemoLibrary()
const { preview } = useUploadPreview()
const image = computed(() =>
  preview.value?.formulaId === props.formula.id ? preview.value.url : undefined,
)
const category = computed(
  () => categories.value.find((item) => item.id === props.formula.categoryId)?.name ?? '未分类',
)
</script>
<template>
  <FormulaListCard
    :title="formula.title"
    :latex="formula.latex"
    :to="'/result/' + formula.id"
    :category="category"
    :favorite="formula.favorite"
    :created-at="formula.updatedAt"
    :image-src="image"
    :sample="formula.source === 'demo'"
    :source-label="formula.source === 'demo' ? '本机预置示例' : '本次演示识别'"
    :compact="compact"
    @favorite="toggleFavorite(formula.id)"
  />
</template>
