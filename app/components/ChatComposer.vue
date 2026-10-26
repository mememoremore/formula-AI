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
const input = ref<HTMLTextAreaElement>()
const container = ref<HTMLFormElement>()
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!container.value) return
  observer = new ResizeObserver(() => {
    if (container.value)
      document.documentElement.style.setProperty(
        '--chat-composer-height',
        container.value.offsetHeight + 'px',
      )
  })
  observer.observe(container.value)
})
onScopeDispose(() => {
  observer?.disconnect()
  if (import.meta.client) document.documentElement.style.removeProperty('--chat-composer-height')
})
const inputId = useId()
watch(draft, async () => {
  await nextTick()
  if (input.value) {
    input.value.style.height = 'auto'
    input.value.style.height = Math.min(input.value.scrollHeight, 144) + 'px'
  }
})
function send() {
  if (!props.busy && !props.disabled && draft.value.trim()) emit('send')
}
function enter(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
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
  bottom: calc(env(safe-area-inset-bottom) + 14px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: 10px;
  width: min(calc(100% - 32px), 448px);
  padding: 10px 10px 10px 17px;
  border: 1px solid #e7e1f2;
  border-radius: 24px;
  background: #fffffff5;
  backdrop-filter: blur(16px);
  box-shadow: 0 6px 28px #4430750c;
}
.chat-composer:focus-within {
  border-color: #b6a7e5;
}
textarea {
  width: 100%;
  min-width: 0;
  min-height: 42px;
  max-height: 144px;
  resize: none;
  border: 0;
  outline: none;
  padding: 10px 0;
  background: transparent;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text);
}
textarea:focus-visible {
  outline: none;
}
textarea::placeholder {
  color: #a8a1b8;
}
.composer-action {
  flex: 0 0 42px;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 50%;
  background: linear-gradient(140deg, #8b6cf8, #6547ed);
  color: white;
}
</style>
