<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'
import type { DuplicateView, RepairView } from '#shared/schemas/formula-intelligence'
import { explanationDomainSchema } from '#shared/explanation-domain'
import { workspaceFeedback } from '~/utils/workspace-feedback'

const props = withDefaults(
  defineProps<{ formula: SavedFormula; ownerId: string; autoCheck?: boolean; progress?: string }>(),
  { autoCheck: true },
)
const emit = defineEmits<{
  saved: [value: SavedFormula]
  finished: []
  cancelled: []
  reviewed: []
}>()
const fetcher = useAccountFetch(),
  invalidate = useFormulaViewsInvalidation()
const duplicate = ref<DuplicateView | null>(null),
  duplicateOpen = ref(false),
  repairOpen = ref(false),
  busy = ref(false),
  checking = ref(false),
  domain = ref(''),
  error = ref(''),
  candidate = ref<RepairView | null>(null)
const version = computed(() => props.formula.versions.at(-1)!)
const endpoint = computed(() => '/api/account/formulas/' + props.formula.id)
const key = () => `moxi:repair:${props.ownerId}:${props.formula.id}`
let controller: AbortController | undefined,
  checkController: AbortController | undefined,
  disposed = false,
  timer: ReturnType<typeof setTimeout> | undefined
const intent = ref<{ requestKey: string; expectedVersionId: string; domain: string } | null>(null)
const headers = () => ({ 'x-account-id': props.ownerId })

async function check() {
  if (disposed || checking.value || repairOpen.value) return
  if (
    props.autoCheck === false ||
    props.formula.versions[0]?.origin === 'DEMO' ||
    version.value.isMock
  ) {
    emit('reviewed')
    return
  }
  if (document.querySelector('dialog[open]')) {
    timer = setTimeout(() => void check(), 500)
    return
  }
  checking.value = true
  checkController = new AbortController()
  try {
    const result = await fetcher<DuplicateView>(endpoint.value + '/duplicate-check', {
      method: 'POST',
      headers: headers(),
      signal: checkController.signal,
      retry: 0,
      timeout: 25000,
    })

    if (disposed) return
    duplicate.value = result
    if (result.status === 'pending') duplicateOpen.value = true
    else if (result.status !== 'checking') emit('reviewed')
    if (result.status === 'checking') timer = setTimeout(() => void check(), 3000)
  } catch {
    if (!disposed)
      duplicate.value = {
        status: 'unavailable',
        versionId: version.value.id,
        reason: '同式核对暂不可用，已保留独立公式。',
      }
    emit('reviewed')
  } finally {
    checking.value = false
  }
}

async function decide(decision: 'agree' | 'ignore') {
  const match = duplicate.value?.match

  if (!match || busy.value) return
  busy.value = true
  error.value = ''
  controller = new AbortController()
  try {
    const saved = await fetcher<SavedFormula>(endpoint.value + '/duplicate-decision', {
      method: 'POST',
      body: {
        versionId: duplicate.value!.versionId,
        matchId: match.id,
        matchVersionId: match.versionId,
        decision,
      },
      headers: headers(),
      signal: controller.signal,
      retry: 0,
    })

    if (!disposed) {
      duplicate.value = { ...duplicate.value!, status: decision }
      duplicateOpen.value = false
      emit('saved', saved)
      await invalidate(props.ownerId)
      emit('reviewed')
    }
  } catch (cause) {
    if (!disposed) error.value = workspaceFeedback(cause, '关联结果未确认，请重新核对。')
  } finally {
    busy.value = false
  }
}

function openRepair(initialDomain?: string, autoStart = false) {
  if (busy.value) return
  error.value = ''
  candidate.value = null
  domain.value = ''
  intent.value = null
  duplicateOpen.value = false
  repairOpen.value = true
  if (!props.formula.image || version.value.isMock) {
    error.value = '该记录没有可用原始图片，请上传图片后使用。'
    return
  }
  try {
    const raw = sessionStorage.getItem(key())

    if (raw) {
      const value = JSON.parse(raw)

      if (
        value.expectedVersionId === version.value.id &&
        typeof value.requestKey === 'string' &&
        typeof value.domain === 'string'
      ) {
        intent.value = value
        domain.value = value.domain
      }
    }
  } catch {
    error.value = '无法读取上次纠错请求，请检查浏览器会话存储。'
  }
  if (initialDomain && !intent.value) domain.value = initialDomain
  if (autoStart) void propose()
}

async function propose() {
  if (busy.value || !props.formula.image) return

  const parsed = explanationDomainSchema.safeParse(domain.value)

  if (!parsed.success) {
    error.value = '请输入1～60字的公式所属领域。'
    return
  }
  if (intent.value && intent.value.domain !== parsed.data) {
    error.value = '上次提交结果尚未确认，请沿用原领域核对。'
    return
  }
  intent.value ??= {
    requestKey: crypto.randomUUID(),
    expectedVersionId: version.value.id,
    domain: parsed.data,
  }
  busy.value = true
  error.value = ''
  controller = new AbortController()
  try {
    sessionStorage.setItem(key(), JSON.stringify(intent.value))

    const result = await fetcher<RepairView>(endpoint.value + '/repair', {
      method: 'POST',
      body: intent.value,
      headers: headers(),
      signal: controller.signal,
      retry: 0,
      timeout: 75000,
    })

    if (disposed) return
    candidate.value = result
    if (result.status === 'FAILED') {
      intent.value = null
      sessionStorage.removeItem(key())
    }
    if (result.status === 'PROCESSING') error.value = '请求仍在处理中，请稍后点击继续核对。'
  } catch (cause) {
    if (!disposed)
      error.value = workspaceFeedback(cause, '提交结果尚未确认，请沿用原请求继续核对。')
  } finally {
    busy.value = false
  }
}

async function confirm() {
  if (busy.value || candidate.value?.status !== 'CANDIDATE') return
  busy.value = true
  error.value = ''
  controller = new AbortController()
  try {
    const saved = await fetcher<SavedFormula>(endpoint.value + '/repair/confirm', {
      method: 'POST',
      body: { proposalId: candidate.value.id },
      headers: headers(),
      signal: controller.signal,
      retry: 0,
    })

    if (!disposed) {
      sessionStorage.removeItem(key())
      intent.value = null
      repairOpen.value = false
      candidate.value = null
      duplicate.value = null
      emit('saved', saved)
      await invalidate(props.ownerId)
      emit('finished')
    }
  } catch (cause) {
    if (!disposed) error.value = workspaceFeedback(cause, '确认结果未核对，请重试确认。')
  } finally {
    busy.value = false
  }
}

function reject() {
  if (busy.value) return
  sessionStorage.removeItem(key())
  intent.value = null
  candidate.value = null
  repairOpen.value = false
  void check()
  emit('finished')
}

function closeRepair() {
  if (busy.value) return
  repairOpen.value = false
  emit('cancelled')
}

function closeDuplicate() {
  if (busy.value) return
  duplicateOpen.value = false
  emit('reviewed')
}

onMounted(() => void check())
watch(
  () => version.value.id,
  () => {
    duplicate.value = null
    duplicateOpen.value = false
    clearTimeout(timer)
    if (!repairOpen.value) void check()
  },
)
onScopeDispose(() => {
  disposed = true
  controller?.abort()
  checkController?.abort()
  clearTimeout(timer)
})
defineExpose({ openRepair })
</script>
<template>
  <section
    v-if="duplicate?.status === 'pending' || duplicate?.status === 'agree'"
    class="card duplicate-notice section"
  >
    <h3>{{ duplicate.status === 'pending' ? '发现疑似相同公式' : '已关联此前公式' }}</h3>
    <MathFormula v-if="duplicate.match" :latex="duplicate.match.latex" />
    <p class="info-note">
      {{
        duplicate.status === 'pending'
          ? '同意后共用名称、收藏、分类及同领域解释；不同意则独立保留；'
          : '本次识别的原图与公式内容独立保留，共享已有公式的整理信息。'
      }}
    </p>
    <button v-if="duplicate.status === 'pending'" class="text-button" @click="duplicateOpen = true">
      核对关联
    </button>
  </section>
  <p v-if="duplicate?.status === 'unavailable'" class="info-note section">{{ duplicate.reason }}</p>
  <AppModal :open="duplicateOpen" title="发现疑似相同公式" @close="closeDuplicate">
    <div class="stack">
      <p class="info-note">此前实际识别过的公式</p>
      <MathFormula v-if="duplicate?.match" :latex="duplicate.match.latex" />
      <p class="info-note">
        {{ duplicate?.reason }}同意后共用名称、收藏、分类和同领域解释；不同意则作为独立公式保留。
      </p>
      <p v-if="error" class="error-text">{{ error }}</p>
      <div class="row choices">
        <button class="button button-white" :disabled="busy" @click="decide('ignore')">
          不同意
        </button>
        <button class="button button-primary" :disabled="busy" @click="decide('agree')">
          同意
        </button>
      </div>
    </div>
  </AppModal>
  <AppModal
    :open="repairOpen"
    :title="candidate?.status === 'CANDIDATE' ? '是需要识别这个公式吗？' : 'AI 协助纠错'"
    @close="closeRepair"
  >
    <div class="stack">
      <p v-if="progress" class="info-note">{{ progress }}</p>
      <template v-if="candidate?.status === 'CANDIDATE'">
        <p class="info-note">原识别结果</p>
        <MathFormula :latex="candidate.originalLatex" />
        <p class="info-note">AI 建议结果 · {{ candidate.domain }}</p>
        <MathFormula :latex="candidate.candidateLatex!" />
        <p class="info-note">{{ candidate.reason }}</p>
        <div class="row choices">
          <button class="button button-white" :disabled="busy" @click="reject">
            否，保留原公式
          </button>
          <button class="button button-primary" :disabled="busy" @click="confirm">
            是，使用此公式
          </button>
        </div>
      </template>
      <template v-else-if="candidate && ['UNCHANGED', 'UNCERTAIN'].includes(candidate.status)">
        <p>
          {{
            candidate.status === 'UNCHANGED' ? '未发现需要修改的内容' : '暂时无法确定，已保留原公式'
          }}
        </p>
        <p class="info-note">{{ candidate.reason }}</p>
        <button class="button button-secondary" @click="reject">保留原公式</button>
      </template>
      <template v-else>
        <MathFormula :latex="version.latex" />
        <label class="field-label">
          公式所属领域
          <input
            v-model="domain"
            class="input"
            maxlength="60"
            placeholder="例如：数学、物理"
            :disabled="busy || !!intent"
          />
        </label>
        <p class="info-note">
          结合这条公式的原始图片与领域提出修改建议；确认后才保存；每次生成使用1次 AI 额度。
        </p>
        <p v-if="candidate?.reason" class="info-note">{{ candidate.reason }}</p>
        <button class="button button-primary" :disabled="busy || !formula.image" @click="propose">
          {{ busy ? '正在结合图片核对…' : intent ? '继续核对原请求' : '生成纠错建议' }}
        </button>
      </template>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    </div>
  </AppModal>
</template>
<style scoped>
.duplicate-notice {
  padding: 18px;
  margin-bottom: 18px;
}
h3 {
  font-size: 15px;
}
.choices {
  gap: 10px;
  flex-wrap: wrap;
}
.choices .button {
  flex: 1;
  min-width: 100px;
  font-size: 13px;
}
.field-label .input {
  margin-top: 10px;
}
</style>
