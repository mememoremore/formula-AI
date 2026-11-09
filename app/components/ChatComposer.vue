<script setup lang="ts">
import { computed, ref, useId, watch, nextTick, onMounted, onScopeDispose } from 'vue'

import { chatFormulaImages, withoutChatFormulaImages } from '#shared/chat-formula'
import { chatSegments } from '~/utils/chat-content'

const draft = defineModel<string>({ required: true })
const props = withDefaults(
  defineProps<{
    ownerId?: string
    busy?: boolean
    stopping?: boolean
    disabled?: boolean
    readonly?: boolean
    placeholder?: string
  }>(),
  { placeholder: '输入你的问题…' },
)
const emit = defineEmits<{ send: []; stop: []; imagePending: [value: boolean] }>()
const composing = ref(false)
const imagePicker = ref<{ choose: (file: File) => void; open: () => void }>(),
  imagePending = ref(false)

watch(imagePending, (value) => emit('imagePending', value))

const images = computed(() => chatFormulaImages(draft.value))
const editableDraft = computed({
  get: () => (images.value.length ? withoutChatFormulaImages(draft.value) : draft.value),
  set: (value: string) => {
    draft.value = images.value.length
      ? [...images.value.map((image) => image.marker), value].join('\n')
      : value
  },
})
const formulas = computed(() =>
  chatSegments(editableDraft.value).filter((part) => part.kind === 'math'),
)

function paste(event: ClipboardEvent) {
  const image = [...(event.clipboardData?.files ?? [])].find((file) =>
    file.type.startsWith('image/'),
  )

  if (
    !image ||
    !props.ownerId ||
    !imagePicker.value ||
    props.disabled ||
    props.readonly ||
    props.busy ||
    imagePending.value ||
    images.value.length >= 3
  )
    return
  event.preventDefault()
  imagePicker.value.choose(image)
}

function insertImage(content: string) {
  draft.value = [draft.value.trim(), content].filter(Boolean).join('\n\n')
}

function removeImage(marker: string) {
  draft.value = draft.value.replace(marker, '').trim()
}

const input = ref<HTMLTextAreaElement>(),
  container = ref<HTMLFormElement>(),
  inputId = useId()
let observer: ResizeObserver | undefined,
  frame = 0,
  disposed = false

function resize() {
  if (!input.value || disposed) return
  input.value.style.height = 'auto'
  input.value.style.height = Math.min(input.value.scrollHeight, 160) + 'px'
}

function viewport() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    if (disposed) return

    const vv = window.visualViewport,
      offset = vv && vv.scale === 1 ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0

    document.documentElement.style.setProperty('--chat-keyboard-offset', offset + 'px')
  })
}

onMounted(() => {
  observer = new ResizeObserver(() => {
    if (container.value)
      document.documentElement.style.setProperty(
        '--chat-composer-height',
        container.value.offsetHeight + 'px',
      )
  })
  if (container.value) observer.observe(container.value)
  window.visualViewport?.addEventListener('resize', viewport)
  window.visualViewport?.addEventListener('scroll', viewport)
  window.addEventListener('resize', viewport)
  resize()
  viewport()
})
onScopeDispose(() => {
  disposed = true
  observer?.disconnect()
  if (import.meta.client) {
    cancelAnimationFrame(frame)
    window.visualViewport?.removeEventListener('resize', viewport)
    window.visualViewport?.removeEventListener('scroll', viewport)
    window.removeEventListener('resize', viewport)
    document.documentElement.style.removeProperty('--chat-composer-height')
    document.documentElement.style.removeProperty('--chat-keyboard-offset')
  }
})
watch(draft, async () => {
  await nextTick()
  resize()
})

function send() {
  if (
    !props.busy &&
    !props.disabled &&
    !props.readonly &&
    !imagePending.value &&
    !composing.value &&
    draft.value.trim() &&
    draft.value.length <= 2000
  )
    emit('send')
}

function enter(event: KeyboardEvent) {
  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.isComposing &&
    !composing.value &&
    event.keyCode !== 229
  ) {
    event.preventDefault()
    send()
  }
}
</script>
<template>
  <form ref="container" class="chat-composer" @submit.prevent="send">
    <div v-if="ownerId || images.length || formulas.length" class="composer-rich">
      <ChatFormulaImage
        v-if="ownerId"
        ref="imagePicker"
        :owner-id="ownerId"
        hide-trigger
        :remaining="2000 - draft.length"
        :disabled="disabled || readonly || busy || images.length >= 3"
        @insert="insertImage"
        @pending="imagePending = $event"
      />
      <div v-if="images.length" class="composer-images" aria-label="已插入公式图片">
        <div v-for="(image, index) in images" :key="image.id + ':' + index" class="composer-image">
          <img :src="image.src" alt="已插入的公式原图" />
          <button
            type="button"
            class="text-button"
            :disabled="disabled || readonly || busy"
            aria-label="移除公式图片"
            @click="removeImage(image.marker)"
          >
            <AppIcon name="close" :size="15" />
          </button>
        </div>
      </div>
      <details v-if="formulas.length" class="composer-math" open>
        <summary>公式预览</summary>
        <MathFormula v-for="(formula, index) in formulas" :key="index" :latex="formula.content" />
      </details>
    </div>
    <div class="composer-entry">
      <button
        v-if="ownerId"
        type="button"
        class="composer-add-image"
        :disabled="disabled || readonly || busy || imagePending || images.length >= 3"
        aria-label="插入公式图片"
        title="插入或粘贴公式图片"
        @click="imagePicker?.open()"
      >
        <AppIcon name="plus" :size="24" />
      </button>
      <label :for="inputId" class="sr-only">输入提问，Shift 加回车换行</label>
      <textarea
        :id="inputId"
        ref="input"
        v-model="editableDraft"
        rows="1"
        :placeholder="placeholder"
        maxlength="2000"
        :disabled="disabled"
        :readonly="readonly"
        @compositionstart="composing = true"
        @compositionend="composing = false"
        @keydown="enter"
        @paste="paste"
      />
      <button
        v-if="busy"
        type="button"
        class="composer-action"
        :disabled="stopping || disabled"
        :aria-label="stopping ? '正在停止生成' : '停止生成'"
        @click="emit('stop')"
      >
        <AppIcon name="stop" :size="18" />
      </button>
      <button
        v-else
        type="submit"
        class="composer-action"
        :disabled="disabled || readonly || imagePending || !draft.trim() || draft.length > 2000"
        aria-label="发送提问"
      >
        <AppIcon name="send" :size="19" />
      </button>
    </div>
  </form>
</template>
<style scoped>
.chat-composer {
  position: fixed;
  z-index: 21;
  bottom: calc(
    var(--bottom-nav-offset) + var(--safe-area-bottom) + var(--chat-keyboard-offset, 0px) + 12px
  );
  left: 50%;
  transform: translateX(-50%);
  display: block;
  width: min(calc(100% - 32px), calc(var(--app-width) - 48px));
  padding: 10px 10px 10px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: #fffffff5;
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-card);
}
.composer-rich {
  max-height: min(42vh, 320px);
  overflow: auto;
  padding-bottom: 6px;
}
.composer-add-image {
  display: grid;
  place-items: center;
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text);
}
.composer-entry {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.composer-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.composer-image {
  position: relative;
  max-width: 100%;
  padding-right: 25px;
}
.composer-image img {
  display: block;
  max-width: 220px;
  max-height: 100px;
  object-fit: contain;
  background: white;
  border-radius: 8px;
}
.composer-image button {
  position: absolute;
  right: 0;
  top: 0;
}
.composer-math {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.chat-composer:focus-within {
  border-color: var(--color-focus);
}
textarea {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  max-height: 160px;
  resize: none;
  border: 0;
  outline: none;
  padding: 10px 0;
  background: transparent;
  font-size: var(--chat-input-font-size, 16px);
  line-height: 1.6;
  color: var(--color-text);
}
textarea:focus-visible {
  outline: none;
}
textarea::placeholder {
  color: var(--color-muted);
}
.composer-action {
  flex: 0 0 44px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 50%;
  background: var(--gradient-primary);
  color: white;
}
</style>
