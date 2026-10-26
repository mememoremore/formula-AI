<script setup lang="ts">
const props = defineProps<{ open: boolean; title: string; sheet?: boolean; fullScreen?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const titleId = useId()
watch(
  () => props.open,
  (open) => {
    if (open) dialog.value?.showModal()
    else dialog.value?.close()
  },
  { flush: 'post' },
)
onMounted(() => {
  if (props.open) dialog.value?.showModal()
})
</script>

<template>
  <dialog
    ref="dialog"
    class="app-modal"
    :class="{ 'app-sheet': sheet, 'app-fullscreen': fullScreen }"
    :aria-labelledby="titleId"
    @cancel.prevent="emit('close')"
    @click="$event.target === dialog && emit('close')"
  >
    <div class="modal-heading">
      <h2 :id="titleId">{{ title }}</h2>
      <button type="button" class="icon-button" aria-label="关闭弹窗" @click="emit('close')">
        <AppIcon name="close" />
      </button>
    </div>
    <slot />
  </dialog>
</template>

<style scoped>
.app-modal {
  width: min(calc(100% - 24px), 456px);
  max-height: 88dvh;
  padding: 24px 24px 30px;
  border: 0;
  border-radius: var(--radius-dialog);
  color: var(--color-text);
  box-shadow: var(--shadow-dialog);
}
.app-modal::backdrop {
  background: var(--color-overlay);
  backdrop-filter: blur(3px);
}
.app-sheet {
  inset: auto 0 0;
  width: min(100%, 480px);
  margin: 0 auto;
  border-radius: 26px 26px 0 0;
  padding-bottom: calc(28px + env(safe-area-inset-bottom));
}
.modal-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.app-fullscreen {
  inset: 0;
  width: min(100%, 480px);
  height: 100dvh;
  max-height: 100dvh;
  margin: 0 auto;
  border-radius: 0;
  padding: calc(20px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom));
}
</style>
