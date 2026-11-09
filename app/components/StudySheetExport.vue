<script setup lang="ts">
import { workspaceFeedback } from '~/utils/workspace-feedback'
import { usageInvalidated } from '~/utils/account-cache'

const props = defineProps<{
  ids: string[]
  disabled?: boolean
  compact?: boolean
  prepare?: () => Promise<boolean>
}>()
const open = ref(false),
  title = ref('我的公式学习清单'),
  includeNotes = ref(true),
  includeConditions = ref(true),
  includeImage = ref(false),
  includeExplanation = ref(false),
  includeQuestions = ref(true),
  busy = ref(false),
  preparing = ref(false),
  feedback = ref('')
const fetcher = useAccountFetch()
let controller: AbortController | undefined,
  disposed = false

onScopeDispose(() => {
  disposed = true
  controller?.abort()
})

async function show() {
  if (busy.value || preparing.value || props.disabled) return
  feedback.value = ''
  preparing.value = true
  try {
    if (props.prepare && !(await props.prepare())) return
    open.value = true
  } finally {
    preparing.value = false
  }
}

async function submit() {
  if (busy.value || props.disabled || !props.ids.length) return
  busy.value = true
  feedback.value = ''
  controller = new AbortController()

  const ids = [...props.ids]

  try {
    const blob = await fetcher<Blob>('/api/account/exports/study-sheet', {
      method: 'POST',
      body: {
        ids,
        title: title.value,
        includeNotes: includeNotes.value,
        includeConditions: includeConditions.value,
        includeImage: includeImage.value,
        includeExplanation: includeExplanation.value,
        includeQuestions: includeQuestions.value,
      },
      responseType: 'blob',
      retry: 0,
      timeout: 120000,
      signal: controller.signal,
    })

    if (disposed || ids.join() !== props.ids.join()) return

    const url = URL.createObjectURL(blob),
      link = document.createElement('a')

    link.href = url
    link.download = title.value + '.docx'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    open.value = false
    clearNuxtData(usageInvalidated)
  } catch (error) {
    if (!disposed)
      feedback.value = workspaceFeedback(
        error,
        '学习清单导出失败，请检查公式、额度或减少原图后重试。',
      )
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <button
    class="button button-secondary"
    :class="{ 'sheet-compact': compact }"
    :disabled="disabled || preparing || !ids.length || ids.length > 20"
    @click="show"
  >
    {{ preparing ? '正在保存…' : '生成学习清单' }}
  </button>
  <AppModal :open="open" title="生成公式学习清单" @close="!busy && (open = false)">
    <div class="stack">
      <label class="sheet-title">
        学习清单标题
        <input
          v-model="title"
          class="input"
          maxlength="100"
          aria-label="学习清单标题"
          :disabled="busy"
        />
      </label>
      <label>
        <input v-model="includeNotes" type="checkbox" :disabled="busy" />
        包含个人笔记
      </label>
      <label>
        <input v-model="includeConditions" type="checkbox" :disabled="busy" />
        包含适用条件
      </label>
      <label>
        <input v-model="includeImage" type="checkbox" :disabled="busy" />
        包含对应原图
      </label>
      <label>
        <input v-model="includeExplanation" type="checkbox" :disabled="busy" />
        包含当前版本已有AI解释
      </label>
      <label>
        <input v-model="includeQuestions" type="checkbox" :disabled="busy" />
        包含复习问题与答案
      </label>
      <p class="info-note">
        共{{ ids.length }}条公式；导出使用1次文档额度，不会重新调用AI，公式可在Word中编辑。
      </p>
      <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
      <button
        class="button button-primary"
        :disabled="busy || !title.trim() || ids.length > 20"
        @click="submit"
      >
        {{ busy ? '正在生成…' : '导出学习清单' }}
      </button>
    </div>
  </AppModal>
</template>
<style scoped>
.sheet-compact {
  min-height: 40px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 13px;
  white-space: nowrap;
}
.sheet-title .input {
  margin-top: 10px;
}
</style>
