<script setup lang="ts">
const props = defineProps<{
  text: string
  label: string
  ariaLabel?: string
  successMessage?: string
}>()
const { showToast } = useToast()
const busy = ref(false),
  fallback = ref<string | null>(null),
  field = ref<HTMLTextAreaElement>()
let generation = 0
watch(
  () => props.text,
  () => {
    generation++
    fallback.value = null
    busy.value = false
  },
)
onScopeDispose(() => {
  generation++
})
async function copy() {
  if (busy.value) return
  const current = ++generation,
    text = props.text
  busy.value = true
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(text)
    if (current !== generation) return
    fallback.value = null
    showToast(props.successMessage || '内容已复制。')
  } catch {
    if (current !== generation) return
    fallback.value = text
    showToast('自动复制失败，请选择下方内容后手动复制。')
  } finally {
    if (current === generation) busy.value = false
  }
}
function select() {
  field.value?.focus()
  field.value?.select()
}
</script>
<template>
  <div class="text-copy-action">
    <button
      type="button"
      class="text-button"
      :aria-label="ariaLabel || label"
      :disabled="busy"
      @click="copy"
    >
      <AppIcon name="copy" :size="15" />
      {{ busy ? '正在复制…' : label }}
    </button>
    <div v-if="fallback !== null" class="copy-fallback">
      <p role="status" class="info-note">自动复制失败。请选择以下内容，使用系统的复制操作。</p>
      <textarea
        ref="field"
        class="input"
        readonly
        :aria-label="label + '：手动复制内容'"
        :value="fallback"
      />
      <button type="button" class="text-button" @click="select">选择全部内容</button>
    </div>
  </div>
</template>
<style scoped>
.text-copy-action,
.copy-fallback {
  min-width: 0;
}
.copy-fallback {
  margin-block: 8px;
}
.copy-fallback textarea {
  display: block;
  width: 100%;
  min-height: 144px;
  margin-block: 8px;
  resize: vertical;
  font-family: monospace;
}
</style>
