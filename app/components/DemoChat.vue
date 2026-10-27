<script setup lang="ts">
import type { FormulaContext } from '#shared/types/api'
const route = useRoute()
const { formulas } = useDemoLibrary()
const sourceFormula = computed(() =>
  formulas.value.find((item) => item.id === route.query.formulaId),
)
const selectedVersion = computed(() =>
  sourceFormula.value?.versions.find((item) => item.id === route.query.demoVersionId),
)
const invalidContext = computed(
  () =>
    (!!route.query.formulaId && !sourceFormula.value) ||
    (!!route.query.demoVersionId && !selectedVersion.value),
)
const formula = computed(() => {
  const value = sourceFormula.value
  if (!value || invalidContext.value) return undefined
  return selectedVersion.value
    ? { ...value, versionId: selectedVersion.value.id, latex: selectedVersion.value.latex }
    : value
})
const context = computed<FormulaContext | undefined>(() =>
  formula.value ? { versionId: formula.value.versionId, latex: formula.value.latex } : undefined,
)
const { messages, pending, error, send, clearMessages } = useDemoChat(context)
const draft = ref('')
onBeforeRouteLeave(() => !draft.value.trim() || window.confirm('演示提问尚未完成，确定离开吗？'))
const { following, bottom } = useChatReading([() => messages.value.length])
async function submit() {
  if (invalidContext.value) return
  if (await send(draft.value.trim())) {
    draft.value = ''
    bottom()
  }
}
</script>
<template>
  <div class="demo-chat">
    <PageHeader title="演示对话" :back-to="formula ? '/result/' + formula.id : '/ai'" />
    <p class="workspace-label">本机演示 · 使用固定模拟回答</p>
    <p v-if="invalidContext" class="error-text section" role="alert">
      指定公式或版本不存在，请返回原公式重新选择。
    </p>
    <div v-if="formula" class="paper-preview"><MathFormula :latex="formula.latex" /></div>
    <div v-if="!messages.length" class="demo-welcome">
      <span class="soft-icon"><AppIcon name="sparkles" :size="24" /></span>
      <h2>从一个问题开始</h2>
      <p>本机保存最近的模拟对话；账号 AI 与演示记录独立。</p>
      <div class="chip-list section">
        <button class="chip" @click="draft = '这个公式怎么推导？'">看看推导过程</button>
        <button class="chip" @click="draft = '给我一个计算例子'">举个计算例子</button>
      </div>
    </div>
    <div v-else class="messages">
      <article v-for="(message, index) in messages" :key="index" :class="message.role">
        <template v-if="message.role === 'assistant'">
          <span class="source">✧ 模拟回答</span>
          <ChatMessageContent :content="message.content" />
        </template>
        <p v-else>{{ message.content }}</p>
      </article>
      <button class="text-button" :disabled="pending" @click="clearMessages">清空本机对话</button>
    </div>
    <p v-if="pending" class="info-note section" role="status">正在请求模拟回答…</p>
    <p v-if="error" class="error-text section" role="alert">{{ error }}</p>
    <button v-if="!following && messages.length" class="text-button" @click="bottom">
      回到最新内容
    </button>
    <ChatComposer v-model="draft" :disabled="pending || invalidContext" @send="submit" />
  </div>
</template>
<style scoped>
.demo-chat {
  padding-bottom: calc(var(--chat-composer-height, 70px) + 42px);
}
.demo-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 18px 0;
}
h2 {
  font-size: 23px;
  margin-top: 18px;
}
.demo-welcome > p {
  font-size: 13px;
  color: var(--color-muted);
  margin-top: 14px;
  line-height: 1.8;
}
.messages {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 24px;
  margin-top: 24px;
}
article {
  font-size: 16px;
  line-height: 1.85;
  min-width: 0;
}
article.user {
  align-self: flex-end;
  max-width: 90%;
  background: #eae5fa;
  padding: 12px 16px;
  border-radius: 18px 18px 4px 18px;
}
article.user p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.source {
  display: block;
  font-size: 11px;
  color: #9690a4;
  margin-bottom: 10px;
}
</style>
