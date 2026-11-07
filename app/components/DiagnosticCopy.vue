<script setup lang="ts">
import { ref, watch } from 'vue'

const route = useRoute()
const diagnostic = useState<{
  traceId: string
  requestId?: string
  status?: number
  path: string
  time: string
} | null>('last-diagnostic', () => null)

// A previous page's failure must not follow the user into an unrelated workflow.
watch(
  () => route.path,
  () => {
    diagnostic.value = null
  },
)

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
  <div v-if="diagnostic" class="diagnostic-copy" role="status" aria-label="请求诊断">
    <button class="text-button" @click="copy">
      {{ copied ? '诊断信息已复制' : '复制诊断信息' }}
    </button>
    <button class="text-button" aria-label="关闭诊断提示" @click="diagnostic = null">关闭</button>
  </div>
</template>
<style scoped>
.diagnostic-copy {
  margin-top: 16px;
  padding: 8px 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  justify-content: center;
  font-size: 12px;
}
.diagnostic-copy button {
  min-height: var(--control-hit-area);
}
</style>
