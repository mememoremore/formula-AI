<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'

const props = defineProps<{ formula: SavedFormula }>()
const formulas = computed(() => {
  const version = props.formula.versions.at(-1)

  return version ? [{ id: version.id, latex: version.latex, label: props.formula.title }] : []
})
</script>
<template><FormulaWordExport :formulas="formulas" /></template>
