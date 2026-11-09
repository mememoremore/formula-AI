<script setup lang="ts">
import { imageQuality } from '~/utils/image-quality'

const props = defineProps<{ file: File | null }>()
const warnings = ref<string[]>([])
let generation = 0

watch(
  () => props.file,
  async (file) => {
    const current = ++generation

    warnings.value = []
    if (!file) return
    try {
      const result = await imageQuality(file)

      if (current === generation) warnings.value = result
    } catch {}
  },
  { immediate: true },
)
onScopeDispose(() => generation++)
</script>
<template>
  <p v-if="warnings.length" class="info-note quality-note" role="status">
    {{ warnings.join('；') }}；此提示不阻止识别，可调整图片后继续。
  </p>
</template>
<style scoped>
.quality-note {
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  margin: 10px 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.8;
}
</style>
