<script setup lang="ts">
const draft = defineModel<string>({ required: true })
const props = withDefaults(
  defineProps<{
    busy?: boolean
    stopping?: boolean
    disabled?: boolean
    readonly?: boolean
    placeholder?: string
  }>(),
  { placeholder: '输入你的问题…' },
)
const emit = defineEmits<{ send: []; stop: [] }>()
const composing = ref(false)
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
  if (!props.busy && !props.disabled && !composing.value && draft.value.trim()) emit('send')
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
    <label :for="inputId" class="sr-only">输入提问，Shift 加回车换行</label>
    <textarea
      :id="inputId"
      ref="input"
      v-model="draft"
      rows="1"
      :placeholder="placeholder"
      maxlength="2000"
      :disabled="disabled"
      :readonly="readonly"
      @compositionstart="composing = true"
      @compositionend="composing = false"
      @keydown="enter"
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
      :disabled="disabled || !draft.trim()"
      aria-label="发送提问"
    >
      <AppIcon name="send" :size="19" />
    </button>
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
  display: flex;
  align-items: flex-end;
  gap: 10px;
  width: min(calc(100% - 32px), calc(var(--app-width) - 48px));
  padding: 10px 10px 10px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: #fffffff5;
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-card);
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
  font-size: 16px;
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
