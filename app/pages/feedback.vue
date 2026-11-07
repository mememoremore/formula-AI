<script setup lang="ts">
definePageMeta({ bottomNav: false, contentWidth: 'reading' })
useHead({ title: '意见反馈 · Formula AI' })

const feedback = ref('')
const kind = ref('问题反馈')
const { showToast } = useToast()
const copying = ref(false),
  copied = ref(false),
  manual = ref(false),
  copyError = ref('')
const prepared = computed(() => `Formula AI ${kind.value}\n\n${feedback.value.trim()}`)
const manualText = ref<HTMLTextAreaElement>()

function selectFeedback() {
  manualText.value?.focus()
  manualText.value?.select()
}

let disposed = false

onScopeDispose(() => {
  disposed = true
})
watch([feedback, kind], () => {
  copied.value = false
  manual.value = false
  copyError.value = ''
})

async function copyFeedback() {
  if (!feedback.value.trim() || copying.value) return
  copying.value = true
  copyError.value = ''

  const text = prepared.value

  try {
    await navigator.clipboard.writeText(text)
    if (disposed || prepared.value !== text) return
    copied.value = true
    manual.value = false
    showToast('反馈已复制，可以自行发送给项目负责人。')
  } catch {
    if (disposed || prepared.value !== text) return
    manual.value = true
    copyError.value = '浏览器未允许自动复制。请在下方选择全部内容，长按或使用 Ctrl/Cmd+C 复制。'
    showToast('复制不可用，请手动选择并复制反馈内容。')
  } finally {
    if (!disposed) copying.value = false
  }
}
</script>

<template>
  <PageHeader title="意见反馈" back-to="/profile" />
  <PageIntro
    :level="2"
    title="让体验更好一点"
    subtitle="发现问题或有新想法？整理后提交到项目反馈页。"
    artwork="book"
    inline-artwork
  />
  <form class="card feedback-form stack" @submit.prevent="copyFeedback">
    <label>
      <span class="field-label">反馈类型</span>
      <select v-model="kind" class="input">
        <option>问题反馈</option>
        <option>功能建议</option>
        <option>界面体验</option>
      </select>
    </label>
    <label>
      <span class="field-label">反馈内容</span>
      <textarea
        v-model="feedback"
        class="input"
        maxlength="2000"
        placeholder="例如：在哪个页面、进行了什么操作、遇到了什么问题…"
        required
      />
    </label>
    <span class="muted text-small character-count">{{ feedback.length }} / 2000</span>
    <button
      class="button button-primary"
      :disabled="!feedback.trim() || copying"
      :aria-busy="copying"
      type="submit"
    >
      <AppIcon name="copy" :size="16" />
      {{ copying ? '正在复制…' : copied ? '再次复制反馈' : '复制反馈内容' }}
    </button>
    <a
      class="button button-secondary"
      href="https://github.com/mememoremore/formula-AI/issues/new"
      target="_blank"
      rel="noopener noreferrer"
    >
      打开 GitHub 反馈页
      <AppIcon name="arrowRight" :size="16" />
    </a>
    <p class="feedback-destination">
      复制内容后，到 GitHub 粘贴并提交公开 Issue。需要登录 GitHub，提交前可继续编辑。
    </p>
  </form>
  <div v-if="copied" class="card copy-result section stack" role="status">
    <h2>已复制，尚未发送</h2>
    <p>点击「打开 GitHub 反馈页」，粘贴内容后提交。复制本身不会发送反馈。</p>
  </div>
  <div v-if="manual" class="card copy-result section stack">
    <p class="error-text" role="alert">{{ copyError }}</p>
    <label>
      <span class="field-label">待复制的完整反馈</span>
      <textarea ref="manualText" :value="prepared" class="input" readonly />
    </label>
    <button class="button button-secondary" type="button" @click="selectFeedback">
      选择全部反馈
    </button>
  </div>
</template>

<style scoped>
.feedback-form {
  padding: 22px;
}
.copy-result {
  padding: 22px;
}
.copy-result h2 {
  font-size: 18px;
}
.copy-result p {
  font-size: 14px;
  line-height: 1.9;
}
textarea {
  min-height: 200px;
}
.character-count {
  align-self: flex-end;
  margin-top: -8px;
}
.feedback-destination {
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.75;
}
</style>
