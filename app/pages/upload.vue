<script setup lang="ts">
import type { RecognitionRequest, RecognitionResult } from '#shared/types/api'
import { errorMessage } from '~/utils/error-message'

definePageMeta({ bottomNav: false, middleware: 'workspace' })
useHead({ title: '公式识别 · Formula AI' })
const fileInput = ref<HTMLInputElement>()
const cameraInput = ref<HTMLInputElement>()
const { preview, attachFormula, replacePreview } = useUploadPreview()
const { file, checking, selectionError, selectImage } = useImageSelection()
const route = useRoute()
const { data: account, error: sessionError, refresh: refreshSession, demo } = useWorkspace()
await useAccountSession()
const accountFlow = computed(() => !!account.value?.user && !demo.value)
const source = ref<'camera' | 'image'>(route.query.source === 'camera' ? 'camera' : 'image')
const accountRecognition = useAccountRecognition()
const { addRecognition } = useDemoLibrary()
const { mode } = useNuxtApp().$uploadDraft
const busy = ref(false)
const error = ref('')
const feedback = computed(() => selectionError.value || error.value)
const buttonLabel = computed(() => {
  if (!busy.value) return accountFlow.value ? '识别并保存到账号' : '开始本机演示（模拟）'
  return accountRecognition.stage.value === 'uploading' ? '正在上传图片…' : '正在提交识别任务…'
})
watch(file, () => {
  error.value = ''
})

async function recognize() {
  if (!preview.value || !file.value || busy.value || checking.value || sessionError.value) return
  busy.value = true
  error.value = ''
  try {
    if (accountFlow.value && account.value?.user) {
      const result = await accountRecognition.recognize(
        file.value,
        account.value.user.id,
        mode.value,
      )
      clearNuxtData('account-overview')
      clearNuxtData('account-history')
      clearNuxtData('account-usage')
      file.value = null
      replacePreview(null)
      await navigateTo(`/recognitions/${result.id}`)
      return
    }
    const body: RecognitionRequest = {
      image: {
        name: file.value.name,
        mimeType: file.value.type as 'image/jpeg' | 'image/png',
        size: file.value.size,
      },
      mode: mode.value,
    }
    const result = await $fetch<RecognitionResult>('/api/recognitions', { method: 'POST', body })
    const formula = addRecognition(result, file.value.name)
    attachFormula(formula.id)
    file.value = null
    await navigateTo(`/result/${formula.id}`)
  } catch (cause) {
    error.value = errorMessage(cause, '保存失败，请检查网络后重试；重复提交不会重复保存。')
  } finally {
    busy.value = false
  }
}
function chooseSource(value: 'camera' | 'image') {
  source.value = value
  if (value === 'camera') cameraInput.value?.click()
  else fileInput.value?.click()
}
</script>

<template>
  <PageHeader title="公式识别" back-to="/" />
  <PageIntro
    :level="2"
    title="让手写公式清晰起来"
    subtitle="拍照或选择图片，把疑问整理成可编辑的公式。"
    artwork="formula"
  />
  <div v-if="sessionError" class="status-panel" role="alert">
    账号状态暂时无法读取。
    <button class="text-button" @click="refreshSession()">重新连接</button>
  </div>
  <p v-else-if="accountFlow" class="upload-account-note">
    <AppIcon name="shield" :size="15" />
    图片与版本将保存到你的账号
  </p>
  <NuxtLink
    v-else
    :to="{ path: '/login', query: { redirect: route.fullPath } }"
    class="upload-account-note"
  >
    登录后上传并保存到账号 · 当前为本机演示
    <AppIcon name="chevron" :size="15" />
  </NuxtLink>
  <input
    ref="fileInput"
    type="file"
    accept="image/jpeg,image/png"
    class="sr-only"
    tabindex="-1"
    aria-label="选择公式图片"
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
    @change="selectImage"
  />
  <button
    class="upload-zone"
    :disabled="busy || checking || !!sessionError"
    @click="chooseSource(source)"
  >
    <img v-if="preview" :src="preview.url" alt="已选择的公式图片预览" />
    <template v-else>
      <span class="upload-plus">
        <AppIcon :name="source === 'camera' ? 'camera' : 'image'" :size="28" />
      </span>
      <strong>
        {{ checking ? '正在检查图片…' : source === 'camera' ? '点击拍摄公式' : '点击选择公式图片' }}
      </strong>
      <span>支持 JPG / PNG · 最大 10MB</span>
    </template>
  </button>
  <div v-if="preview" class="row between preview-meta">
    <span>{{ preview.name }}</span>
    <button
      type="button"
      class="text-button"
      :disabled="busy || checking"
      @click="chooseSource(source)"
    >
      重新选择
    </button>
  </div>
  <p class="or-label">或</p>
  <button
    class="button button-white button-block"
    :disabled="busy || checking"
    @click="chooseSource(source === 'camera' ? 'image' : 'camera')"
  >
    <AppIcon :name="source === 'camera' ? 'image' : 'camera'" :size="18" />
    {{ source === 'camera' ? '从相册或文件选择' : '改用拍照' }}
  </button>
  <fieldset class="mode-fieldset section">
    <legend class="field-label">识别模式</legend>
    <div class="mode-options">
      <label :class="{ selected: mode === 'handwritten' }">
        <input v-model="mode" type="radio" value="handwritten" :disabled="busy" />
        手写公式
      </label>
      <label :class="{ selected: mode === 'printed' }">
        <input v-model="mode" type="radio" value="printed" :disabled="busy" />
        印刷公式
      </label>
    </div>
  </fieldset>
  <p v-if="feedback" class="error-text upload-error" role="alert">{{ feedback }}</p>
  <button
    class="button button-primary button-block recognize-button"
    :disabled="!file || busy || checking || !!sessionError"
    @click="recognize"
  >
    {{ buttonLabel }}
  </button>
  <p class="info-note upload-note">
    {{
      accountFlow
        ? '图片会上传至私有存储，自动校正方向；结果和修改版本保存在账号。'
        : '本机演示只预览图片，不上传内容，也不会保存到账号。'
    }}{{
      accountFlow
        ? '识别结果请核对后使用；手写与印刷模式会传给识别服务。'
        : '演示返回固定样例，不代表所选图片内容。'
    }}
  </p>
</template>

<style scoped>
.upload-subtitle {
  color: var(--color-muted);
  margin: 7px 0 20px;
  font-size: 12px;
  line-height: 1.8;
}
.upload-account-note {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 13px 14px;
  margin-bottom: 20px;
  border-radius: 12px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 11px;
  line-height: 1.7;
}
.upload-zone {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 240px;
  padding: 24px;
  border: 1.5px dashed #9389e4;
  border-radius: 20px;
  background: #fff;
}
.upload-zone strong {
  font-size: 14px;
  font-weight: 600;
}
.upload-zone > span:last-child {
  color: #a1a1ae;
  font-size: 11px;
}
.upload-plus {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}
.upload-zone img {
  display: block;
  max-width: 100%;
  max-height: 240px;
  object-fit: contain;
}
.preview-meta {
  font-size: 11px;
  color: var(--color-muted);
}
.preview-meta > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-meta button {
  flex-shrink: 0;
}
.or-label {
  margin: 18px 0;
  color: #acabb6;
  font-size: 11px;
}
.mode-fieldset {
  padding: 0;
  border: 0;
  margin-inline: 0;
}
.mode-options {
  display: flex;
  gap: 4px;
  padding: 5px;
  border-radius: 12px;
  background: var(--color-primary-soft);
}
.mode-options label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 1;
  min-height: 43px;
  border-radius: 9px;
  font-size: 13px;
  color: var(--color-muted);
  cursor: pointer;
}
.mode-options label.selected {
  background: #fff;
  color: var(--color-primary);
  box-shadow: 0 1px 5px #6257e512;
}
input[type='radio'] {
  margin: 0;
  accent-color: var(--color-primary);
  width: 13px;
}
.recognize-button {
  margin-top: 18px;
}
.upload-error {
  margin-top: 14px;
}
.upload-note {
  margin-top: 16px;
}
</style>
