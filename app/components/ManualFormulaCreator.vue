<script setup lang="ts">
import { formulaSyntaxFeedback, manualFormulaFeedback } from '#shared/formula-validation'
import { workspaceFeedback } from '~/utils/workspace-feedback'
const props = defineProps<{ ownerId: string }>()
const title = ref(''),
  latex = ref(''),
  feedback = ref(''),
  completed = ref(false)
const creation = useManualFormulaCreation(toRef(props, 'ownerId'))
const { receipt, busy, ready, recoveryError } = creation
watch(
  receipt,
  (value) => {
    if (value) {
      title.value = value.input.title
      latex.value = value.input.latex
    }
  },
  { immediate: true },
)
const validation = computed(() => manualFormulaFeedback(title.value, latex.value))
const displayValidation = computed(() =>
  validation.value.startsWith('LaTeX 暂时无法预览：')
    ? '公式暂时无法预览，请检查命令、括号与参数是否完整。'
    : validation.value,
)
const syntax = computed(() => (latex.value.trim() ? formulaSyntaxFeedback(latex.value) : ''))
const dirty = computed(() => !!title.value.trim() || !!latex.value.trim() || !!receipt.value)
const showLeaveConfirmation = ref(false)
let resolveLeave: ((leave: boolean) => void) | undefined
let leavingConfirmed = false
const removeAfterEach = useRouter().afterEach((_to, _from, failure) => {
  if (failure) leavingConfirmed = false
})
function confirmLeave(leave: boolean) {
  showLeaveConfirmation.value = false
  leavingConfirmed = leave
  const resolve = resolveLeave
  resolveLeave = undefined
  resolve?.(leave)
}
function canLeave() {
  if (completed.value) return true
  if (busy.value) return false
  if (!dirty.value) return true
  if (resolveLeave) return false
  showLeaveConfirmation.value = true
  return new Promise<boolean>((resolve) => { resolveLeave = resolve })
}
onBeforeRouteLeave(canLeave)
onBeforeRouteUpdate(canLeave)
function beforeUnload(event: BeforeUnloadEvent) {
  if (completed.value || leavingConfirmed || (!dirty.value && !busy.value)) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onScopeDispose(() => {
  confirmLeave(false)
  removeAfterEach()
  if (import.meta.client) window.removeEventListener('beforeunload', beforeUnload)
})
async function save() {
  if (busy.value || !ready.value || validation.value) return
  feedback.value = ''
  try {
    const formula = await creation.save(title.value, latex.value)
    completed.value = true
    await navigateTo('/formulas/' + encodeURIComponent(formula.id))
  } catch (error) {
    feedback.value = workspaceFeedback(error, '保存结果尚未确认，请用原请求重试；草稿已保留。')
  }
}
function discard() {
  if (
    window.confirm(
      '上次请求可能已经保存，请先到公式库核对。放弃回执不会撤销已创建的公式，确定继续吗？',
    )
  )
    creation.discard()
}
</script>
<template>
  <form class="manual-layout" @submit.prevent="save">
    <section class="card manual-fields" aria-label="手动公式内容">
      <label class="field-label" for="manual-title">公式名称</label>
      <input
        id="manual-title"
        v-model="title"
        class="input"
        maxlength="100"
        autocomplete="off"
        placeholder="为公式起个名字"
        :disabled="!ready || busy || !!receipt"
      />
      <label class="field-label" for="manual-latex">LaTeX</label>
      <textarea
        id="manual-latex"
        v-model="latex"
        class="input manual-source"
        maxlength="5000"
        spellcheck="false"
        placeholder="例如：\frac{a}{b}"
        :disabled="!ready || busy || !!receipt"
        :aria-invalid="!!syntax"
        aria-describedby="manual-feedback"
      />
      <p v-if="dirty && validation" id="manual-feedback" class="error-text" role="status">
        {{ displayValidation }}
      </p>
      <details v-if="dirty && syntax && validation === syntax" class="info-note">
        <summary>查看技术详情</summary>
        <p>{{ syntax }}</p>
      </details>
    </section>
    <section class="card manual-preview" aria-label="LaTeX 实时预览">
      <h2>实时预览</h2>
      <MathFormula v-if="latex.trim() && !syntax" :latex="latex" tabindex="0" />
      <p v-else-if="syntax" class="info-note">修正输入后，预览会自动更新。</p>
      <p v-else class="info-note">输入后会显示公式预览。预览校验语法，不判断数学结论。</p>
    </section>
    <div class="manual-submit">
      <p v-if="receipt" class="info-note" role="status">
        上次保存结果待确认。内容与请求编号已保留，重试不会重复创建。
      </p>
      <p v-if="recoveryError || feedback" role="alert" class="error-text">
        {{ recoveryError || feedback }}
      </p>
      <button
        class="button button-primary button-block"
        type="submit"
        :disabled="!ready || busy || !!validation"
      >
        {{ busy ? '正在保存…' : receipt ? '确认上次保存' : '保存到账号公式库' }}
      </button>
      <div v-if="receipt || recoveryError" class="manual-recovery">
        <NuxtLink class="text-button" to="/library?space=account">到公式库核对</NuxtLink>
        <button class="text-button" type="button" :disabled="busy" @click="discard">
          放弃待确认请求
        </button>
      </div>
    </div>
    <AppModal :open="showLeaveConfirmation" :title="receipt ? '保存结果待确认' : '公式还未保存'" @close="confirmLeave(false)">
      <p class="leave-message">
        {{ receipt ? '上次保存结果尚未确认，回执会保留。离开后可回到此页继续核对。' : '离开后，当前输入的内容将丢失。' }}
      </p>
      <div class="leave-actions">
        <button class="button button-white" type="button" @click="confirmLeave(false)">继续编辑</button>
        <button class="button button-primary" type="button" @click="confirmLeave(true)">{{ receipt ? '离开并保留回执' : '放弃并离开' }}</button>
      </div>
    </AppModal>
  </form>
</template>
<style scoped>
.manual-layout {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.manual-fields,
.manual-preview {
  padding: 20px;
  min-width: 0;
}
.field-label {
  display: block;
  margin-bottom: 8px;
}
.manual-fields .input {
  width: 100%;
  margin-bottom: 16px;
}
.manual-source {
  min-height: 200px;
  resize: vertical;
  font-family: var(--font-mono, monospace);
  line-height: 1.7;
}
.manual-preview h2 {
  font-size: 16px;
  margin-bottom: 16px;
}
.manual-submit {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.manual-recovery {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.error-text {
  overflow-wrap: anywhere;
}
.leave-message {
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.8;
}
.leave-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 24px;
}
.leave-actions .button {
  min-width: 0;
  padding-inline: 8px;
}
@media (min-width: 768px) {
  .manual-layout {
    gap: 20px;
  }
  .manual-fields,
  .manual-preview {
    padding: 24px;
  }
}
</style>
