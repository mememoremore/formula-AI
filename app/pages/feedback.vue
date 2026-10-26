<script setup lang="ts">
definePageMeta({ bottomNav: false })
useHead({ title: '意见反馈 · Formula AI' })
const feedback = ref('')
const kind = ref('问题反馈')
const { showToast } = useToast()

async function copyFeedback() {
  if (!feedback.value.trim()) return
  try {
    await navigator.clipboard.writeText(`Formula AI ${kind.value}\n\n${feedback.value.trim()}`)
    showToast('反馈已复制，可以自行发送给项目负责人。')
  } catch {
    showToast('复制不可用，请手动选择并复制反馈内容。')
  }
}
</script>

<template>
  <PageHeader title="意见反馈" back-to="/profile" />
  <PageIntro
    :level="2"
    title="让体验更好一点"
    subtitle="无论是问题、建议还是小小的灵感，我们都愿意听见。"
    artwork="book"
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
    <button class="button button-primary" :disabled="!feedback.trim()" type="submit">
      <AppIcon name="copy" :size="16" />
      复制反馈内容
    </button>
  </form>
  <p class="info-note section">
    当前尚未接入反馈服务，内容不会发送给任何人。复制后，你可以自行发送给项目负责人。
  </p>
</template>

<style scoped>
.feedback-form {
  padding: 22px;
}
textarea {
  min-height: 200px;
}
.character-count {
  align-self: flex-end;
  margin-top: -8px;
}
</style>
