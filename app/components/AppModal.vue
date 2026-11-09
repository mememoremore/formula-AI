<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  open: boolean
  title: string
  sheet?: boolean
  fullScreen?: boolean
  containedScroll?: boolean
}>()
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
  <Teleport to="#teleports">
    <dialog
      ref="dialog"
      v-bind="$attrs"
      class="app-modal"
      :class="{
        'app-sheet': sheet,
        'app-fullscreen': fullScreen,
        'app-contained': containedScroll,
      }"
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
      <div v-if="containedScroll" class="modal-body"><slot /></div>
      <slot v-else />
    </dialog>
  </Teleport>
</template>

<style scoped>
.app-modal {
  position: fixed;
  inset: 0;
  margin: auto;
  height: fit-content;
  overflow: auto;
  overscroll-behavior: contain;
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
  width: min(calc(100% - 24px), 480px);
  border-radius: var(--radius-dialog);
  padding-bottom: calc(28px + env(safe-area-inset-bottom));
}
.modal-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.app-fullscreen {
  width: min(calc(100% - 24px), 480px);
  height: min(88dvh, 800px);
  max-height: 88dvh;
  border-radius: var(--radius-dialog);
  padding: 20px 24px 24px;
}
.app-contained.app-sheet {
  max-width: 100%;
}
.app-contained[open] {
  display: flex;
  flex-direction: column;
  height: min(82dvh, 720px);
  overflow: hidden;
}
.app-contained .modal-heading {
  flex-shrink: 0;
}
.modal-body {
  flex: 1;
  min-height: 0;
}
</style>
