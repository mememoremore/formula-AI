<script setup lang="ts">
import type { RecognitionTaskState } from '#shared/types/tasks'
import type { SavedFormula } from '#shared/types/workspace'
import { chatFormulaAttachment } from '#shared/chat-formula'
import { workspaceFeedback } from '~/utils/workspace-feedback'
import { recognitionInvalidates } from '~/utils/recognition-state'

const props = defineProps<{
  ownerId: string
  disabled?: boolean
  remaining: number
  hideTrigger?: boolean
}>()
const emit = defineEmits<{ insert: [content: string]; pending: [value: boolean] }>()
const fetcher = useAccountFetch()
const input = ref<HTMLInputElement>(),
  file = shallowRef<File>(),
  preview = ref(''),
  mode = ref<'handwritten' | 'printed'>('handwritten'),
  busy = ref(false),
  error = ref(''),
  taskId = ref(''),
  modeLocked = ref(false)
let uploadKey = '',
  requestKey = '',
  fileId = '',
  recognized = '',
  disposed = false,
  controller: AbortController | undefined,
  timer: ReturnType<typeof setTimeout> | undefined,
  wake: (() => void) | undefined

function remove() {
  controller?.abort()
  clearTimeout(timer)
  wake?.()
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = ''
  file.value = undefined
  fileId = recognized = uploadKey = requestKey = ''
  taskId.value = ''
  modeLocked.value = false
  error.value = ''
  emit('pending', false)
}

function choose(value: File) {
  if (props.disabled || busy.value) return
  if (
    !['image/jpeg', 'image/png'].includes(value.type) ||
    !value.size ||
    value.size > 10 * 1024 * 1024
  ) {
    error.value = '请选择10MB以内的JPG/JPEG、PNG公式图片。'
    return
  }
  remove()
  file.value = value
  preview.value = URL.createObjectURL(value)
  uploadKey = crypto.randomUUID()
  requestKey = crypto.randomUUID()
  emit('pending', true)
}

function selected(event: Event) {
  const target = event.target as HTMLInputElement
  const value = target.files?.[0]

  target.value = ''
  if (value) choose(value)
}

function insert() {
  let content: string

  try {
    content = chatFormulaAttachment(fileId, recognized)
  } catch {
    error.value = '识别结果暂时无法插入，请到任务详情校对公式后重试。'
    return
  }
  if (content.length + 2 > props.remaining) {
    error.value = '公式和问题合计超过2000字，请缩短提问或裁剪为更短公式后再插入。'
    return
  }
  emit('insert', content)
  remove()
}

async function recognize() {
  if (busy.value || props.disabled || !file.value) return
  busy.value = true
  error.value = ''

  const active = new AbortController()

  controller = active

  const owner = props.ownerId
  const check = () => {
    active.signal.throwIfAborted()
    if (disposed || props.ownerId !== owner) throw new Error('账号或页面已变化')
  }

  try {
    if (recognized) {
      insert()
      return
    }
    if (!fileId) {
      const result = await fetcher<{ image: { id: string } }>('/api/account/files', {
        method: 'POST',
        body: file.value,
        retry: 0,
        timeout: 60000,
        signal: active.signal,
        headers: {
          'content-type': file.value.type,
          'x-file-name': encodeURIComponent(file.value.name),
          'x-upload-key': uploadKey,
        },
      })

      check()
      fileId = result.image.id
    }
    modeLocked.value = true

    let task = await fetcher<RecognitionTaskState>('/api/account/recognitions', {
      method: 'POST',
      body: { fileId, mode: mode.value, requestKey },
      retry: 0,
      timeout: 30000,
      signal: active.signal,
    })

    check()
    taskId.value = task.id
    clearNuxtData((key) => recognitionInvalidates(key, 'submitted') || key === 'tasks:' + owner)

    const deadline = Date.now() + 120000

    while (task.status === 'QUEUED' || task.status === 'PROCESSING') {
      if (Date.now() > deadline) {
        error.value = '图片仍在识别，可稍后继续读取；后台任务不会因离开此页停止。'
        return
      }
      await new Promise<void>((resolve) => {
        wake = resolve
        timer = setTimeout(resolve, 1500)
      })
      check()
      task = await fetcher<RecognitionTaskState>('/api/account/tasks/' + task.id, {
        retry: 0,
        timeout: 15000,
        signal: active.signal,
      })
      check()
    }
    if (task.status !== 'COMPLETED' || !task.formulaId) {
      error.value = task.errorMessage || '图片识别失败，请到任务详情核对后重试。'
      return
    }

    const formula = await fetcher<SavedFormula>('/api/account/formulas/' + task.formulaId, {
      retry: 0,
      timeout: 15000,
      signal: active.signal,
    })

    check()
    recognized = formula.versions.at(-1)?.latex ?? ''
    clearNuxtData((key) => recognitionInvalidates(key, 'completed') || key === 'tasks:' + owner)
    insert()
  } catch (cause) {
    if (!active.signal.aborted && !disposed)
      error.value = workspaceFeedback(cause, '图片尚未处理完成，可继续读取原任务。')
  } finally {
    if (!disposed) busy.value = false
    if (controller === active) controller = undefined
  }
}

watch(() => props.ownerId, remove, { flush: 'sync' })
onScopeDispose(() => {
  disposed = true
  remove()
})
defineExpose({ choose, open: () => input.value?.click() })
</script>
<template>
  <div class="chat-image-picker">
    <input
      ref="input"
      class="sr-only"
      type="file"
      accept="image/jpeg,image/png,.jpg,.jpeg,.png"
      :disabled="disabled || busy"
      aria-label="选择公式图片"
      @change="selected"
    />
    <button
      v-if="!hideTrigger"
      type="button"
      class="image-trigger"
      :disabled="disabled || busy"
      aria-label="插入公式图片"
      title="插入或粘贴公式图片"
      @click="input?.click()"
    >
      <AppIcon name="imagePlus" :size="20" />
      <span>公式图片</span>
    </button>
    <div v-if="file" class="image-preparation">
      <img :src="preview" alt="待识别的公式图片" />
      <div class="image-controls">
        <select
          v-model="mode"
          class="input"
          aria-label="图片公式类型"
          :disabled="busy || modeLocked"
        >
          <option value="handwritten">手写公式</option>
          <option value="printed">印刷公式</option>
        </select>
        <button type="button" class="text-button" :disabled="busy" @click="remove">移除</button>
        <button
          type="button"
          class="button button-secondary"
          :disabled="disabled || busy"
          @click="recognize"
        >
          {{ busy ? '正在识别…' : taskId ? '继续读取并插入' : '识别并插入' }}
        </button>
      </div>
      <p class="info-note">每张图片识别1条公式，使用1次识别额度；插入后可校对再发送。</p>
      <NuxtLink v-if="taskId" :to="'/recognitions/' + taskId" class="text-button">
        查看识别任务
      </NuxtLink>
    </div>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.chat-image-picker {
  min-width: 0;
}
.image-trigger {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  min-height: 32px;
  font-size: 12px;
}
.image-preparation {
  padding: 8px 0;
}
img {
  display: block;
  max-width: 100%;
  max-height: 140px;
  object-fit: contain;
  border-radius: 8px;
}
.image-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.image-controls .input {
  width: auto;
  min-width: 0;
}
.image-controls .button {
  min-height: 36px;
  padding: 6px 10px;
  font-size: 12px;
}
</style>
