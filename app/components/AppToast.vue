<script setup lang="ts">
const { message, timestamp } = useToast()
let timer: ReturnType<typeof setTimeout> | undefined
watch(timestamp, () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    message.value = ''
  }, 3500)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div v-if="message" class="toast" role="status">{{ message }}</div>
</template>

<style scoped>
.toast {
  position: fixed;
  z-index: 100;
  bottom: calc(
    var(--bottom-nav-offset) + var(--chat-composer-height, 0px) + var(--safe-area-bottom) + 20px
  );
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: min(calc(100% - 48px), 400px);
  border-radius: 12px;
  padding: 13px 18px;
  background: #2c2943;
  color: #fff;
  font-size: 13px;
  line-height: 1.6;
  box-shadow: 0 8px 30px #28223b22;
}
</style>
