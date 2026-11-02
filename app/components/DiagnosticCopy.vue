<script setup lang="ts">
const diagnostic = useState<{
  traceId: string
  requestId?: string
  status?: number
  path: string
  time: string
} | null>('last-diagnostic', () => null)
const copied = ref(false)
watch(diagnostic, () => {
  copied.value = false
})
async function copy() {
  if (!diagnostic.value) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(diagnostic.value, null, 2))
    copied.value = true
  } catch {
    copied.value = false
  }
}
</script>
<template>
  <div v-if="diagnostic" class="diagnostic-copy">
    <button class="text-button" @click="copy">
      {{ copied ? '诊断信息已复制' : '复制诊断信息' }}
    </button>
    <button class="text-button" aria-label="关闭诊断提示" @click="diagnostic = null">关闭</button>
  </div>
</template>
<style scoped>
.diagnostic-copy {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom) + 104px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px #0001;
  white-space: nowrap;
  display: flex;
  gap: 16px;
  justify-content: center;
  padding: 8px 12px;
  font-size: 12px;
}
</style>
