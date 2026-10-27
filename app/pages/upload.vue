<script setup lang="ts">
import type { RecognitionRequest, RecognitionResult } from '#shared/types/api'
import { workspaceFeedback } from '~/utils/workspace-feedback'
import { recognitionInvalidates } from '~/utils/recognition-state'
definePageMeta({ bottomNav: false, middleware: 'workspace', contentWidth: 'reading' })
useHead({ title: '公式识别 · Formula AI' })
const route = useRoute(),
  fileInput = ref<HTMLInputElement>(),
  cameraInput = ref<HTMLInputElement>()
const { preview, attachFormula, replacePreview } = useUploadPreview()
const { file, checking, selectionError, selectImage, removeImage } = useImageSelection()
const {
  data: account,
  error: sessionError,
  status: sessionStatus,
  refresh: refreshSession,
  demo,
} = useWorkspace()
await useAccountSession()
const accountFlow = computed(() => !!account.value?.user && !demo.value)
const ownerId = computed(() =>
  sessionStatus.value === 'success' && !sessionError.value && accountFlow.value
    ? account.value?.user?.id
    : undefined,
)
const flow = useAccountRecognition(ownerId)
const draft = useNuxtApp().$uploadDraft,
  { mode } = draft
const source = ref<'camera' | 'image'>(route.query.source === 'camera' ? 'camera' : 'image')
const { addRecognition } = useDemoLibrary()
const pending = ref(false),
  error = ref('')
const feedback = computed(() => selectionError.value || error.value)
const blocked = computed(
  () =>
    pending.value || checking.value || sessionStatus.value !== 'success' || !!sessionError.value,
)
const selectionLocked = computed(() => blocked.value || (accountFlow.value && flow.uncertain.value))
let sequence = 0,
  disposed = false,
  demoController: AbortController | undefined
function cancel() {
  sequence++
  flow.cancel()
  demoController?.abort()
  pending.value = false
}
const identity = computed(() =>
  sessionStatus.value !== 'success' || sessionError.value
    ? 'unconfirmed'
    : accountFlow.value
      ? 'account:' + ownerId.value
      : 'demo',
)
watch(
  identity,
  (value) => {
    cancel()
    if (value === 'unconfirmed') return
    if (draft.ownerId.value && value !== 'account:' + draft.ownerId.value) {
      removeImage()
      draft.ownerId.value = null
    }
    if (ownerId.value) draft.ownerId.value = ownerId.value
  },
  { immediate: true, flush: 'sync' },
)
watch(
  [sessionStatus, () => account.value?.user?.id],
  ([status, id]) => {
    if (status === 'success') draft.confirmOwner(id ?? null)
  },
  { immediate: true, flush: 'sync' },
)
watch(
  file,
  () => {
    cancel()
    error.value = ''
  },
  { flush: 'sync' },
)
watch(
  flow.receipt,
  (value) => {
    if (value) mode.value = value.mode
  },
  { immediate: true },
)
function choose(value: 'camera' | 'image') {
  if (selectionLocked.value) return
  source.value = value
  ;(value === 'camera' ? cameraInput : fileInput).value?.click()
}
async function recognize() {
  if (blocked.value || (!file.value && !flow.receipt.value)) return
  const token = ++sequence,
    original = file.value,
    space = identity.value
  pending.value = true
  error.value = ''
  try {
    if (accountFlow.value) {
      const task = await flow.recognize(original, mode.value)
      if (disposed || token !== sequence || identity.value !== space) return
      clearNuxtData((key) => recognitionInvalidates(key, 'submitted'))
      file.value = null
      replacePreview(null)
      await navigateTo('/recognitions/' + encodeURIComponent(task.id))
    } else if (original) {
      demoController = new AbortController()
      const body: RecognitionRequest = {
        image: {
          name: original.name,
          mimeType: original.type as 'image/jpeg' | 'image/png',
          size: original.size,
        },
        mode: mode.value,
      }
      const result = await $fetch<RecognitionResult>('/api/recognitions', {
        method: 'POST',
        body,
        signal: demoController.signal,
        retry: 0,
        timeout: 15_000,
      })
      if (disposed || token !== sequence || identity.value !== space) return
      const formula = addRecognition(result, original.name)
      attachFormula(formula.id)
      file.value = null
      await navigateTo('/result/' + encodeURIComponent(formula.id) + '?space=demo')
    }
  } catch (cause) {
    if (!disposed && token === sequence)
      error.value = workspaceFeedback(
        cause,
        accountFlow.value
          ? '连接结果暂未确认，请用原请求重试，并在最近识别中核对。'
          : '演示暂时无法完成，请重试。',
      )
  } finally {
    if (token === sequence) pending.value = false
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (pending.value || file.value || flow.receipt.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onScopeDispose(() => {
  disposed = true
  cancel()
  if (import.meta.client) window.removeEventListener('beforeunload', beforeUnload)
})
const buttonLabel = computed(() =>
  sessionError.value || sessionStatus.value !== 'success'
    ? '等待账号确认'
    : pending.value
      ? flow.stage.value === 'uploading'
        ? '正在上传图片…'
        : accountFlow.value
          ? '正在提交识别任务…'
          : '正在生成演示结果…'
      : flow.receipt.value
        ? '确认上次识别提交'
        : accountFlow.value
          ? '识别并保存到账号'
          : '开始本机演示（模拟）',
)
</script>
<template>
  <PageHeader title="公式识别" back-to="/" />
  <header class="upload-intro">
    <div>
      <p class="kicker">从一张图片，开始理解</p>
      <h2>让公式清晰起来</h2>
      <p>拍照或选择图片，整理成可编辑的数学公式。</p>
    </div>
    <img src="/images/home-paper.svg" alt="" width="100" height="120" />
  </header>
  <div v-if="sessionError" class="card status-panel" role="alert">
    <h2>暂时无法确认账号</h2>
    <p>请先重新连接，图片不会自动改为游客提交。</p>
    <button class="text-button" @click="refreshSession()">重新连接账号</button>
  </div>
  <p v-else-if="sessionStatus === 'pending'" class="info-note" role="status">正在确认公式空间…</p>
  <p v-else class="upload-space">
    <AppIcon :name="accountFlow ? 'shield' : 'info'" :size="16" />
    {{ accountFlow ? '账号识别 · 图片私有保存' : '本机演示 · 固定样例，不代表真实识别' }}
  </p>
  <input
    ref="fileInput"
    type="file"
    accept="image/jpeg,image/png"
    class="sr-only"
    tabindex="-1"
    aria-label="选择公式图片"
    :disabled="selectionLocked"
    @change="selectImage"
  />
  <input
    ref="cameraInput"
    type="file"
    accept="image/jpeg,image/png"
    capture="environment"
    class="sr-only"
    tabindex="-1"
    aria-label="拍摄公式图片"
    :disabled="selectionLocked"
    @change="selectImage"
  />
  <div class="upload-workspace">
    <div class="upload-picture">
      <UploadImageCard
        :preview="sessionStatus === 'success' && !sessionError ? preview : null"
        :checking="checking"
        :disabled="selectionLocked"
        :source="source"
        @choose="choose(source)"
        @remove="removeImage"
      />
      <button
        class="button button-white button-block alternate-source"
        :disabled="selectionLocked"
        @click="choose(source === 'camera' ? 'image' : 'camera')"
      >
        <AppIcon :name="source === 'camera' ? 'image' : 'camera'" :size="18" />
        {{ source === 'camera' ? '从相册或文件选择' : '改用拍照' }}
      </button>
    </div>
    <section class="upload-controls" aria-label="识别设置与提交">
      <fieldset class="mode-fieldset card">
        <legend>识别模式</legend>
        <div class="mode-options">
          <label :class="{ selected: mode === 'handwritten' }">
            <input v-model="mode" type="radio" value="handwritten" :disabled="selectionLocked" />
            手写公式
          </label>
          <label :class="{ selected: mode === 'printed' }">
            <input v-model="mode" type="radio" value="printed" :disabled="selectionLocked" />
            印刷公式
          </label>
        </div>
        <p class="info-note">选择与图片内容相符的模式。</p>
      </fieldset>
      <div v-if="pending" class="submission-status" role="status" aria-live="polite">
        <span class="busy-indicator" />
        {{ buttonLabel }}
        <p>
          {{
            flow.stage.value === 'uploading'
              ? '上传完成后才会提交后台任务。'
              : '请勿重复操作，任务提交后可离开等待页。'
          }}
        </p>
      </div>
      <p v-if="flow.uncertain.value && accountFlow && !pending" class="info-note recovery-note">
        上次提交结果尚未确认，将沿用原图片和请求继续确认。为避免重复任务，暂时不能更换图片或模式。
      </p>
      <p
        v-if="draft.recoveryWarning.value && draft.recoveryWarning.value !== feedback"
        class="error-text"
        role="alert"
      >
        {{ draft.recoveryWarning.value }}
      </p>
      <p v-if="feedback" class="error-text upload-error" role="alert">{{ feedback }}</p>
      <button
        class="button button-primary button-block recognize-button"
        :disabled="blocked || (!file && !flow.receipt.value)"
        :aria-busy="pending"
        @click="recognize"
      >
        {{ buttonLabel }}
      </button>
      <NuxtLink
        v-if="accountFlow"
        to="/library?space=account&view=recent"
        class="text-button recent-link"
      >
        查看最近识别
        <AppIcon name="chevron" :size="14" />
      </NuxtLink>
      <NuxtLink
        v-else-if="sessionStatus === 'success' && !sessionError"
        :to="{ path: '/login', query: { redirect: route.fullPath } }"
        class="text-button recent-link"
      >
        登录并使用账号识别
      </NuxtLink>
      <p class="info-note upload-note">
        {{
          sessionError || sessionStatus !== 'success'
            ? '账号状态尚未确认，重新连接后可继续。图片不会被自动提交。'
            : accountFlow
              ? '图片先上传至私有存储，再提交异步任务。识别后请核对结果。'
              : '演示仅发送图片名称、类型和大小，不上传图片内容；结果只保存在本机。'
        }}
      </p>
    </section>
  </div>
  <AccountUsage v-if="ownerId" :key="ownerId" :owner-id="ownerId" />
</template>
<style scoped>
.upload-intro {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 82px;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
}
.upload-intro h2 {
  font-size: 28px;
  line-height: 1.5;
  letter-spacing: -0.7px;
  overflow-wrap: anywhere;
}
.upload-intro p {
  font-size: 13px;
  line-height: 1.8;
  color: var(--color-text-secondary);
  margin-top: 8px;
}
.upload-intro .kicker {
  font-size: 12px;
  color: var(--color-primary);
  margin: 0 0 6px;
}
.upload-intro img {
  display: block;
  width: 100%;
  height: auto;
}
.upload-space {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px;
  border-radius: var(--radius-control);
  background: var(--color-primary-soft);
  font-size: 12px;
  line-height: 1.8;
  margin-bottom: 20px;
  color: var(--color-text-secondary);
}
.upload-workspace {
  display: grid;
  gap: 24px;
}
.upload-picture,
.upload-controls {
  min-width: 0;
}
.alternate-source {
  margin-top: 14px;
}
.mode-fieldset {
  min-width: 0;
  margin: 0;
  padding: 16px;
  border: 1px solid var(--color-border);
}
legend {
  font-size: 14px;
  font-weight: 600;
  padding: 0 8px;
}
.mode-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 4px 0 12px;
}
.mode-options label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 48px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font-size: 13px;
  cursor: pointer;
}
.mode-options .selected {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border-color: var(--color-primary);
}
input[type='radio'] {
  accent-color: var(--color-primary);
  margin: 0;
  width: 14px;
}
.recognize-button {
  margin-top: 20px;
}
.upload-error,
.recovery-note,
.upload-note {
  margin-top: 16px;
  line-height: 1.9;
  overflow-wrap: anywhere;
}
.recent-link {
  margin-top: 8px;
}
.submission-status {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  font-size: 14px;
  color: var(--color-primary);
}
.submission-status p {
  font-size: 12px;
  line-height: 1.9;
  color: var(--color-text-secondary);
  margin-top: 8px;
}
@media (min-width: 900px) {
  .upload-workspace {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    align-items: start;
  }
  .upload-intro {
    grid-template-columns: minmax(0, 1fr) 110px;
  }
}
</style>
