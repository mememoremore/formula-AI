<script setup lang="ts">
import { workspaceFeedback } from '~/utils/workspace-feedback'
import {
  copyFormulaImage,
  copySourceFormulas,
  FormulaClipboardError,
} from '~/utils/formula-clipboard'

const props = defineProps<{ formulas: string[]; preselected?: boolean }>()
const open = ref(false),
  step = ref<'select' | 'format'>('format'),
  selected = ref<number[]>([]),
  busy = ref(false),
  error = ref(''),
  manual = ref('')
const toast = useToast(),
  fetcher = useAccountFetch()

function show() {
  selected.value = props.preselected
    ? props.formulas.map((_, i) => i)
    : props.formulas.length === 1
      ? [0]
      : []
  step.value = props.formulas.length > 1 && !props.preselected ? 'select' : 'format'
  error.value = ''
  manual.value = ''
  open.value = true
}

async function copy(format: 'latex' | 'formula' | 'text' | 'image') {
  if (busy.value || !selected.value.length) return
  busy.value = true
  error.value = ''
  manual.value = ''
  try {
    const formulas = [...selected.value]
      .sort((a, b) => a - b)
      .map((i) => props.formulas[i]!)
      .filter(Boolean)

    if (!formulas.length) throw new Error('请选择公式')

    const text =
      format === 'text'
        ? (
            await fetcher<{ text: string }>('/api/account/math/text', {
              method: 'POST',
              body: { formulas },
              retry: 0,
              timeout: 20000,
            })
          ).text
        : formulas.join('\n')

    try {
      if (format === 'formula') await copySourceFormulas(formulas)
      else if (format === 'image')
        await copyFormulaImage(() =>
          fetcher<Blob>('/api/account/math/image', {
            method: 'POST',
            body: { formulas },
            responseType: 'blob',
            retry: 0,
            timeout: 60000,
          }),
        )
      else await navigator.clipboard.writeText(text)
      open.value = false
      toast.showToast(format === 'image' ? '已复制公式图片' : '已复制')
    } catch (cause) {
      if (format === 'latex' || format === 'text') {
        manual.value = text
        error.value = '浏览器未允许自动复制，请选择下方内容手动复制。'
      } else {
        error.value =
          cause instanceof FormulaClipboardError
            ? cause.message
            : workspaceFeedback(
                cause,
                '自动复制未完成，请允许浏览器访问剪贴板，或使用 LaTeX / Word 导出。',
              )
      }
    }
  } catch (cause) {
    error.value = workspaceFeedback(cause, '复制失败，请重试。')
  } finally {
    busy.value = false
  }
}

watch(
  () => props.formulas.join('\u0000'),
  () => {
    open.value = false
  },
)
</script>
<template>
  <button class="button button-white" @click="show">
    <AppIcon name="copy" :size="16" />
    复制公式
  </button>
  <AppModal
    :open="open"
    :title="step === 'select' ? '选择要复制的公式' : '选择复制格式'"
    @close="!busy && (open = false)"
  >
    <div class="stack">
      <template v-if="step === 'select'">
        <label v-for="(formula, index) in formulas" :key="index" class="formula-option">
          <input
            v-model="selected"
            type="checkbox"
            :value="index"
            :aria-label="'选择公式 ' + (index + 1)"
          />
          <span>
            <MathFormula :latex="formula" />
          </span>
        </label>
        <button class="button button-primary" :disabled="!selected.length" @click="step = 'format'">
          确认选择
        </button>
      </template>
      <template v-else>
        <button class="button button-primary" :disabled="busy" @click="copy('latex')">
          复制 LaTeX
        </button>
        <button class="button button-secondary" :disabled="busy" @click="copy('formula')">
          复制源公式
        </button>
        <p class="info-note">用于 Word 等支持 MathML 的公式编辑器。</p>
        <button class="button button-secondary" :disabled="busy" @click="copy('text')">
          复制目标公式
        </button>
        <p class="info-note">用于聊天框和普通文本框，尽量保留公式符号、上下标和分式含义。</p>
        <button class="button button-secondary" :disabled="busy" @click="copy('image')">
          复制公式图片
        </button>
        <p class="info-note">
          用于支持图片的聊天或文档，保留公式排版；图片不可直接编辑；复制内容以当前识别或编辑结果为准。
        </p>
      </template>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <textarea
        v-if="manual"
        class="input"
        :value="manual"
        readonly
        aria-label="待手动复制的公式"
        @focus="($event.target as HTMLTextAreaElement).select()"
      />
    </div>
  </AppModal>
</template>
<style scoped>
.formula-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  min-width: 0;
}
.formula-option > span {
  min-width: 0;
  flex: 1;
}
</style>
