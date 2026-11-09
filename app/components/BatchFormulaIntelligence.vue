<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'
import { explanationDomainSchema } from '#shared/explanation-domain'

const props = defineProps<{
  ownerId: string
  formulas: { id: string; latex: string; versionId: string }[]
}>()
const emit = defineEmits<{ saved: [] }>()
const fetcher = useAccountFetch(),
  open = ref(false),
  fields = ref<{ id: string; latex: string; versionId: string; domain: string }[]>([]),
  error = ref(''),
  loading = ref(false),
  position = ref(0),
  current = ref<SavedFormula | null>(null)
const flow = ref<{ openRepair: (domain?: string, autoStart?: boolean) => void }>()
let disposed = false,
  controller: AbortController | undefined

onScopeDispose(() => {
  disposed = true
  controller?.abort()
})

function begin() {
  if (loading.value || current.value) return
  fields.value = props.formulas.map((f) => ({ ...f, domain: '' }))
  error.value = ''
  open.value = true
}

async function next() {
  current.value = null
  if (position.value >= fields.value.length) {
    loading.value = false
    return
  }

  const field = fields.value[position.value]!

  loading.value = true
  controller = new AbortController()
  try {
    const saved = await fetcher<SavedFormula>('/api/account/formulas/' + field.id, {
      headers: { 'x-account-id': props.ownerId },
      signal: controller.signal,
      retry: 0,
    })

    if (disposed) return
    if (saved.versions.at(-1)?.id !== field.versionId) throw Error('公式已变更，请重新选择。')
    current.value = saved
    await nextTick()
    flow.value?.openRepair(field.domain, true)
  } catch {
    if (!disposed) {
      error.value = '公式已变化或暂时无法读取，请重新选择。'
      open.value = true
    }
  } finally {
    loading.value = false
  }
}

function start() {
  if (fields.value.some((f) => !explanationDomainSchema.safeParse(f.domain).success)) {
    error.value = '请填写每条所选公式的所属领域（1～60字）。'
    return
  }
  fields.value.forEach((f) => {
    f.domain = explanationDomainSchema.parse(f.domain)
  })
  open.value = false
  position.value = 0
  void next()
}

function finished() {
  emit('saved')
  position.value++
  void next()
}
</script>
<template>
  <button
    class="button button-white"
    :disabled="loading || !!current || !formulas.length"
    @click="begin"
  >
    <AppIcon name="rotate" :size="16" />
    重新生成
  </button>
  <AppModal
    :open="open"
    title="填写所选公式的领域"
    contained-scroll
    @close="!loading && (open = false)"
  >
    <div class="stack">
      <label v-for="field in fields" :key="field.id" class="card domain-field">
        <MathFormula :latex="field.latex" />
        <input
          v-model="field.domain"
          class="input"
          maxlength="60"
          aria-label="公式所属领域"
          placeholder="例如：数学、物理"
        />
      </label>
      <p class="info-note">按顺序处理每条公式对应的图片，逐条确认是否采用 AI 候选。</p>
      <p v-if="error" class="error-text">{{ error }}</p>
      <button class="button button-primary" :disabled="loading" @click="start">开始重新生成</button>
    </div>
  </AppModal>
  <AccountFormulaIntelligence
    v-if="current"
    :key="current.id"
    ref="flow"
    :formula="current"
    :owner-id="ownerId"
    :auto-check="false"
    :progress="'正在处理 ' + (position + 1) + ' / ' + fields.length"
    @finished="finished"
    @cancelled="current = null"
  />
</template>
<style scoped>
.domain-field {
  padding: 14px;
  min-width: 0;
}
.domain-field .input {
  margin-top: 12px;
}
</style>
