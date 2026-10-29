<script setup lang="ts">
const props = defineProps<{ conversationId: string; ownerId: string }>()
const chat = useAccountChat(props.conversationId, props.ownerId)
const { data: conversation, error, status } = chat.request
const { busy, feedback, stopping, streamFeedback, generating, submitting, pendingIntent } = chat
const { recoveryReady, recoveryWarning } = chat
const refresh = chat.refresh
const turn = computed(() => conversation.value?.currentTurn)
const draft = ref('')
onBeforeRouteLeave(
  () =>
    !draft.value.trim() ||
    !!pendingIntent.value ||
    window.confirm('提问尚未发送，确定放弃草稿吗？'),
)
function beforeUnload(event: BeforeUnloadEvent) {
  if (draft.value.trim() && !pendingIntent.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onScopeDispose(() => {
  if (import.meta.client) window.removeEventListener('beforeunload', beforeUnload)
})
watch(
  pendingIntent,
  (value) => {
    if (value) draft.value = value.question
  },
  { immediate: true },
)
const { showToast } = useToast()
const { following, bottom } = useChatReading([
  () => conversation.value?.messages.length,
  () => turn.value?.partialContent,
])
async function submit() {
  if (await chat.send(draft.value)) {
    draft.value = ''
    bottom()
  }
}
async function copy(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    showToast('回答已复制。')
  } catch {
    showToast('复制不可用，请手动选择文字。')
  }
}
await chat.request
</script>
<template>
  <div class="account-chat">
    <PageHeader :title="conversation?.context?.title || 'AI 对话'" back-to="/ai" />
    <details v-if="conversation?.context" class="chat-context">
      <summary>
        <AppIcon name="book" :size="15" />
        <span>{{ conversation.context.title }}</span>
        <small>v{{ conversation.context.number }}</small>
        <AppIcon name="chevron" :size="14" />
      </summary>
      <MathFormula :latex="conversation.context.latex" />
      <p class="info-note">对话绑定此公式版本，后续修改不会改变这里的上下文。</p>
    </details>
    <template v-if="conversation">
      <p class="info-note">上下文仅使用已完成问答；失败和停止记录不参与，当前提问会单独加入。</p>
      <p v-if="!conversation.messages.length" class="info-note section">
        从符号含义、推导过程或使用条件开始提问。
      </p>
      <p v-if="conversation.hasEarlierMessages" class="info-note section">
        展示最近 100 条消息，更早记录仍保存在账号中。
      </p>
      <div class="chat-messages">
        <article
          v-for="message in conversation.messages"
          :key="message.id"
          class="chat-message"
          :class="message.role.toLowerCase()"
        >
          <template v-if="message.role === 'ASSISTANT'">
            <div class="message-source">
              <AppIcon name="sparkles" :size="14" />
              <span>{{ message.isMock ? '模拟回答' : 'DeepSeek' }}</span>
              <span v-if="message.status === 'FAILED'">· 回答未完成</span>
            </div>
            <ChatMessageContent :content="message.content" />
            <button
              class="text-button copy-answer"
              aria-label="复制回答"
              @click="copy(message.content)"
            >
              <AppIcon name="copy" :size="14" />
              复制
            </button>
          </template>
          <p v-else>{{ message.content }}</p>
        </article>
        <article
          v-if="turn?.status === 'PROCESSING' && turn.partialContent"
          class="chat-message assistant streaming"
        >
          <div class="message-source">
            <AppIcon name="sparkles" :size="14" />
            <span>{{ turn.isMock ? '模拟回答' : 'DeepSeek' }} · 生成中</span>
          </div>
          <ChatMessageContent :content="turn.partialContent" />
        </article>
      </div>
      <p v-if="busy && !error" class="stream-status" role="status">
        <span class="stream-dot" />
        {{ turn?.status === 'PROCESSING' ? '正在生成…' : '问题已排队…' }}
      </p>
      <p v-if="streamFeedback && busy" class="info-note section">{{ streamFeedback }}</p>
      <button
        v-if="streamFeedback && busy"
        class="text-button"
        :disabled="status === 'pending'"
        @click="refresh"
      >
        重新连接实时更新
      </button>
      <p v-if="turn?.status === 'FAILED'" class="error-text section" role="alert">
        {{ turn.errorMessage }} 已生成的内容会保留；重新发送会使用一次额度。
      </p>
    </template>
    <div v-if="error" class="status-panel" role="alert">
      <p>
        {{
          [401, 403, 404].includes(error.statusCode ?? 0)
            ? '对话不存在或当前账号无法访问，请返回会话列表。'
            : '对话暂时无法读取，已显示的内容会保留。'
        }}
      </p>
      <button class="text-button" :disabled="status === 'pending'" @click="refresh()">
        重新连接
      </button>
    </div>
    <div v-if="pendingIntent" class="status-panel section">
      <p>原提问尚未确认，重试沿用原请求。原问题和请求标识暂存于此标签页，确认后移除。</p>
      <button class="text-button" :disabled="submitting" @click="submit">确认原提问</button>
    </div>
    <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
    <p
      v-if="recoveryWarning && recoveryWarning !== feedback"
      class="error-text section"
      role="alert"
    >
      {{ recoveryWarning }}
    </p>
    <button v-if="!following && conversation?.messages.length" class="jump-latest" @click="bottom">
      回到最新内容 ↓
    </button>
    <ChatComposer
      v-model="draft"
      :busy="generating"
      :stopping="stopping"
      :readonly="!!pendingIntent"
      :disabled="!!error || !conversation || submitting || (!recoveryReady && !generating)"
      @send="submit"
      @stop="chat.stop"
    />
  </div>
</template>
<style scoped>
.account-chat {
  min-width: 0;
  padding-bottom: calc(var(--chat-composer-height, 70px) + 42px);
}
.chat-context {
  border: 1px solid #e8e3f3;
  border-radius: 14px;
  padding: 13px 16px;
  background: #ffffff80;
}
summary {
  display: flex;
  align-items: center;
  gap: 9px;
  cursor: pointer;
  list-style: none;
  color: #7c7299;
  font-size: 12px;
}
summary span {
  flex: 1;
  overflow-wrap: anywhere;
}
summary small {
  font-size: 10px;
}
summary::-webkit-details-marker {
  display: none;
}
.chat-context .info-note {
  margin-top: 8px;
}
.chat-messages {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 24px;
  margin-top: 24px;
}
.chat-message {
  min-width: 0;
  font-size: 16px;
  line-height: 1.85;
}
.chat-message.user {
  align-self: flex-end;
  max-width: 90%;
  padding: 12px 16px;
  background: #eae5fa;
  color: #51416f;
  border-radius: 18px 18px 4px 18px;
}
.chat-message.user p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.chat-message.assistant {
  padding: 0 2px;
  background: transparent;
}
.message-source {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #9690a4;
  font-size: 11px;
  margin-bottom: 10px;
}
.message-source svg {
  color: #8a72d0;
}
.copy-answer {
  color: #9b91ad;
  min-height: 44px;
  font-size: 11px;
  margin-top: 9px;
}
.stream-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #9a8eae;
  font-size: 11px;
  margin-top: 18px;
}
.stream-dot {
  width: 5px;
  height: 5px;
  background: #987be1;
  border-radius: 50%;
  animation: breathe 1.3s infinite;
}
.streaming :deep(.message-content)::after {
  content: '▍';
  color: #9c85d8;
  animation: breathe 1s infinite;
}
.jump-latest {
  position: fixed;
  z-index: 22;
  bottom: calc(
    var(--chat-composer-height, 80px) + var(--chat-keyboard-offset, 0px) + var(--safe-area-bottom) +
      24px
  );
  left: 50%;
  transform: translateX(-50%);
  border: 1px solid #e3dbf4;
  border-radius: 20px;
  background: white;
  color: var(--color-primary);
  padding: 9px 17px;
  min-height: 44px;
  max-width: calc(100% - 32px);
  font-size: 12px;
  box-shadow: var(--shadow-card);
}
@keyframes breathe {
  50% {
    opacity: 0.3;
  }
}
</style>
