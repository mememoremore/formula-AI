<script setup lang="ts">
import type { AccountUser } from '#shared/types/account'
const props = withDefaults(
  defineProps<{ user?: AccountUser | null; size?: number; preview?: string }>(),
  { size: 48 },
)
const failed = ref(false)
const image = ref<HTMLImageElement>()
function failedImage(event: Event) {
  if (event.target === image.value) failed.value = true
}
const src = computed(() => props.preview || props.user?.image || '')
watch(src, () => {
  failed.value = false
})
</script>
<template>
  <span
    class="user-avatar"
    :style="{ width: size + 'px', height: size + 'px', fontSize: size * 0.34 + 'px' }"
  >
    <img v-if="src && !failed" :key="src" ref="image" :src="src" alt="头像" @error="failedImage" />
    <img v-else src="/images/default-avatar.svg" alt="默认头像" />
  </span>
</template>
<style scoped>
.user-avatar {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  color: #6257c8;
  background: linear-gradient(135deg, #e7e2ff, #f2effa);
  box-shadow: 0 0 0 5px #ffffff90;
  font-weight: 600;
}
img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
