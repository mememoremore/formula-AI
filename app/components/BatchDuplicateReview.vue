<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'

const props = defineProps<{ ownerId: string; formulas: { id: string; versionId: string }[] }>()
const emit = defineEmits<{ saved: [] }>()
const fetcher = useAccountFetch(),
  current = ref<SavedFormula | null>(null),
  seen = new Set<string>()
let loading = false,
  disposed = false,
  controller: AbortController | undefined

async function next() {
  if (loading || disposed || current.value) return

  const item = props.formulas.find((f) => !seen.has(f.id + ':' + f.versionId))

  if (!item) return
  loading = true
  seen.add(item.id + ':' + item.versionId)
  controller = new AbortController()
  try {
    const value = await fetcher<SavedFormula>('/api/account/formulas/' + item.id, {
      headers: { 'x-account-id': props.ownerId },
      signal: controller.signal,
      retry: 0,
    })

    if (!disposed) current.value = value
  } catch {
  } finally {
    loading = false
    if (!current.value && !disposed) void next()
  }
}

function reviewed() {
  current.value = null
  void next()
}

watch(
  () => props.formulas.map((f) => f.id + f.versionId).join(','),
  () => void next(),
)
onMounted(() => void next())
onScopeDispose(() => {
  disposed = true
  controller?.abort()
})
</script>
<template>
  <AccountFormulaIntelligence
    v-if="current"
    :key="current.id"
    :formula="current"
    :owner-id="ownerId"
    @reviewed="reviewed"
    @saved="emit('saved')"
  />
</template>
