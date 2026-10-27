<script setup lang="ts">
import { safeReturnPath } from '#shared/navigation'
const props = defineProps<{ error: { statusCode?: number; message?: string } }>()
const code = computed(() => props.error.statusCode ?? 500)
const heading = computed(() =>
  code.value === 404
    ? '这一页暂时不在这里'
    : code.value === 401 || code.value === 403
      ? '暂时无法访问这一页'
      : code.value === 503
        ? '服务暂时不可用'
        : '这一页暂时未能加载',
)
const description = computed(() =>
  code.value === 404
    ? '链接可能已失效，请检查地址，或回到首页继续探索公式。'
    : code.value === 401 || code.value === 403
      ? '请从首页重新进入，确认当前账号是否具有访问权限。'
      : '连接或页面加载遇到了问题。可以重试当前页面；这不会主动新建识别或 AI 任务。',
)
const backTo = ref(''),
  leaving = ref(false)
onMounted(() => {
  const previous = safeReturnPath(window.history.state?.back, '')
  if (previous && previous.split(/[?#]/)[0] !== window.location.pathname) backTo.value = previous
})
function recover(target: string) {
  if (leaving.value) return
  leaving.value = true
  return clearError({ redirect: safeReturnPath(target, '/') })
}
function retryPage() {
  leaving.value = true
  reloadNuxtApp({ force: true })
}
</script>
<template>
  <div class="error-page">
    <PaperArtwork kind="idea" />
    <span class="error-code">
      {{ code === 404 ? '404 · 页面未找到' : 'Formula AI · 访问遇到问题' }}
    </span>
    <h1>{{ heading }}</h1>
    <p>{{ description }}</p>
    <button
      v-if="code !== 404"
      class="button button-primary"
      :disabled="leaving"
      @click="retryPage"
    >
      重试当前页面
    </button>
    <button
      v-if="backTo"
      class="button button-secondary"
      :disabled="leaving"
      @click="recover(backTo)"
    >
      返回上一页
    </button>
    <button class="text-button" :disabled="leaving" @click="recover('/')">返回首页</button>
  </div>
</template>
<style scoped>
.error-page {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 24px;
  min-height: 100dvh;
  width: min(100%, 600px);
  margin: 0 auto;
  padding: calc(24px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom));
  text-align: center;
}
h1 {
  font-size: clamp(23px, 6vw, 30px);
}
.error-code {
  color: var(--color-primary);
  font-size: 12px;
  letter-spacing: 1px;
}
.error-page .button,
.error-page .text-button {
  min-height: 44px;
  width: min(100%, 320px);
}
p {
  font-size: 14px;
  line-height: 1.9;
  color: var(--color-muted);
  max-width: 360px;
}
</style>
