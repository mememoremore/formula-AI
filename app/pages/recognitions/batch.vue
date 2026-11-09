<script setup lang="ts">
import type { RecognitionTaskState } from '#shared/types/tasks'
import type { SavedFormula } from '#shared/types/workspace'
import { resourceIdPattern } from '#shared/resource-id'

definePageMeta({ middleware: 'auth', contentWidth: 'reading' })
useHead({ title: '多公式识别 · 墨析' })

const route = useRoute(),
  session = await useAccountSession(),
  fetcher = useAccountFetch()
const owner = computed(() => session.data.value?.user?.id)
const ids = computed(() =>
  [
    ...new Set(
      String(route.query.ids ?? '')
        .split(',')
        .filter((id) => resourceIdPattern.test(id)),
    ),
  ].slice(0, 20),
)
const formulas = ref<SavedFormula[]>([]),
  loading = ref(false),
  error = ref('')
const taskFormulas = ref<Record<string, string>>({})
let disposed = false,
  timer: ReturnType<typeof setTimeout> | undefined,
  controller: AbortController | undefined

async function refresh() {
  if (loading.value || !owner.value || !ids.value.length) return

  const identity = owner.value

  loading.value = true
  controller = new AbortController()
  try {
    const tasks = await Promise.all(
      ids.value.map((id) =>
        fetcher<RecognitionTaskState>('/api/account/tasks/' + id, {
          signal: controller!.signal,
          retry: 0,
        }),
      ),
    )
    const saved = await Promise.all(
      tasks
        .filter((t) => t.formulaId)
        .map((t) =>
          fetcher<SavedFormula>('/api/account/formulas/' + t.formulaId, {
            signal: controller!.signal,
            retry: 0,
          }),
        ),
    )

    if (disposed || identity !== owner.value) return
    formulas.value = saved
    taskFormulas.value = Object.fromEntries(
      tasks.flatMap((task) => (task.formulaId ? [[task.id, task.formulaId]] : [])),
    )
    error.value = ''
    if (tasks.some((t) => ['QUEUED', 'PROCESSING'].includes(t.status)))
      timer = setTimeout(refresh, 2000)
  } catch {
    if (!disposed) error.value = '部分结果暂时无法读取，请重试。'
  } finally {
    loading.value = false
  }
}

watch([owner, () => route.query.ids], () => {
  controller?.abort()
  formulas.value = []
  void refresh()
})
onMounted(refresh)
onScopeDispose(() => {
  disposed = true
  controller?.abort()
  clearTimeout(timer)
})

const exportFormulas = computed(() =>
  formulas.value.flatMap((f) => {
    const version = f.versions.at(-1)

    return version ? [{ id: version.id, latex: version.latex, label: f.title }] : []
  }),
)
</script>
<template>
  <div>
    <PageHeader title="多公式识别结果" back-to="/upload" />
    <div v-if="exportFormulas.length" class="batch-actions">
      <FormulaCopyAction :formulas="exportFormulas.map((f) => f.latex)" />
      <FormulaWordExport :formulas="exportFormulas" />
    </div>
    <p v-if="error" class="error-text" role="alert">
      {{ error }}
      <button class="text-button" @click="refresh">重新读取</button>
    </p>
    <p v-if="!ids.length" class="info-note">没有有效的识别任务。</p>
    <section v-for="(id, index) in ids" :key="String(owner) + id" class="batch-task">
      <h2>公式 {{ index + 1 }}</h2>
      <div v-if="formulas.find((f) => f.id === taskFormulas[id])" class="paper-preview">
        <MathFormula
          :latex="formulas.find((f) => f.id === taskFormulas[id])?.versions.at(-1)?.latex || ''"
        />
      </div>
      <AccountRecognitionTask v-if="owner" :id="id" :owner-id="owner" />
    </section>
  </div>
</template>
<style scoped>
.batch-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}
.batch-task {
  padding: 20px 0;
  border-top: 1px solid var(--color-border);
}
.batch-task > h2 {
  font-size: 18px;
  margin-bottom: 12px;
}
</style>
