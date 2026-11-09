<script setup lang="ts">
import { displayFormulaTitle } from '#shared/formula-title'
import { explanationLayout } from '~/utils/explanation-layout'
import { explanationCopyText } from '~/utils/explanation-copy'

const props = defineProps<{ conversationId: string; ownerId: string }>()
const chat = useAccountChat(props.conversationId, props.ownerId)
const { data: conversation, error, status } = chat.request
const { busy, feedback, stopping, streamFeedback, generating, submitting, pendingIntent } = chat
const { recoveryReady, recoveryWarning } = chat
const refresh = chat.refresh
const layout = computed(() =>
  conversation.value ? explanationLayout(conversation.value) : { question: null, messages: [] },
)
const turn = computed(() => conversation.value?.currentTurn)
const draft = ref(''),
  preparingImage = ref(false)
const accountSession = useAccountSession()

onBeforeRouteLeave(
  () =>
    (!draft.value.trim() && !preparingImage.value) ||
    !!pendingIntent.value ||
    window.confirm('提问尚未发送，确定放弃草稿吗？'),
)

function beforeUnload(event: BeforeUnloadEvent) {
  if ((draft.value.trim() || preparingImage.value) && !pendingIntent.value) {
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

await chat.request
</script>
<template>
  <div class="account-chat">
    <div class="chat-header">
      <PageHeader
        :title="displayFormulaTitle(conversation?.context?.title || 'AI助手')"
        back-to="/ai/history"
      />
      <details v-if="conversation?.context" class="chat-context">
        <summary>
          <AppIcon name="book" :size="15" />
          <span class="context-label">公式参考</span>
          <MathFormula
            class="context-summary"
            :latex="conversation.context.latex"
            :display="false"
          />
          <AppIcon name="chevron" :size="14" />
        </summary>
        <MathFormula :latex="conversation.context.latex" />
      </details>
    </div>
    <template v-if="conversation">
      <article
        v-if="layout.question"
        class="chat-message user explanation-question"
        aria-label="解释提问"
      >
        <ChatQuestionContent :content="layout.question" />
      </article>
      <section v-if="conversation.purpose === 'EXPLANATION'" class="card explanation-base">
        <template v-if="conversation.baseExplanation">
          <h2>AI 结构化解释</h2>
          <p v-if="conversation.baseExplanation.isMock" class="info-note">模拟解释</p>
          <TextCopyAction
            :text="explanationCopyText(conversation.baseExplanation.structured)"
            label="复制完整解释"
          />
          <FormulaExplanationContent :value="conversation.baseExplanation.structured" />
        </template>
        <p v-else role="status">
          {{ busy ? '正在生成解释…' : '这次解释未完成，可返回重新生成。' }}
        </p>
        <nav v-if="conversation.context" class="explanation-navigation" aria-label="解释操作">
          <NuxtLink
            :to="{
              path: '/formulas/' + conversation.context.formulaId,
              hash: '#explanation-create',
            }"
            class="text-button"
          >
            重新生成
          </NuxtLink>
          <NuxtLink
            v-if="conversation.context"
            :to="{
              path: '/formulas/' + conversation.context.formulaId,
              hash: '#explanation-history',
            }"
            class="text-button"
          >
            查看历史
          </NuxtLink>
        </nav>
      </section>
      <p v-if="!conversation.messages.length" class="info-note section">
        从符号含义、推导过程或使用条件开始提问。
      </p>
      <p v-if="conversation.hasEarlierMessages" class="info-note section">
        展示最近 100 条消息，更早记录仍保存在账号中。
      </p>
      <div class="chat-messages">
        <article
          v-for="message in layout.messages"
          :key="message.id"
          class="chat-message"
          :class="message.role.toLowerCase()"
        >
          <span v-if="message.role === 'ASSISTANT'" class="moxi-message-avatar">
            <img src="/images/moxi-icon.png" alt="墨析" width="36" height="36" />
          </span>
          <UserAvatar
            v-else
            class="moxi-message-avatar"
            :user="accountSession.data.value?.user"
            :size="36"
          />
          <template v-if="message.role === 'ASSISTANT'">
            <div class="message-source">
              <AppIcon name="sparkles" :size="14" />
              <span>{{ message.isMock ? '模拟回答' : 'AI' }}</span>
              <span v-if="message.status === 'FAILED'">· 回答未完成</span>
            </div>
            <ChatMessageContent :content="message.content" />
            <TextCopyAction
              class="copy-answer"
              :text="message.content"
              label="复制"
              aria-label="复制回答"
              success-message="回答已复制。"
            />
          </template>
          <ChatQuestionContent v-else :content="message.content" />
        </article>
        <article
          v-if="turn?.status === 'PROCESSING' && turn.partialContent"
          class="chat-message assistant streaming"
        >
          <div class="message-source">
            <AppIcon name="sparkles" :size="14" />
            <span>{{ turn.isMock ? '模拟回答' : 'AI' }} · 生成中</span>
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
      <button
        v-if="chat.retryQuestion.value && !pendingIntent"
        class="text-button regenerate-answer"
        :disabled="busy || !!error || !recoveryReady"
        @click="
          chat.regenerate().then((sent) => {
            if (sent) bottom()
          })
        "
      >
        重新生成（使用1次额度）
      </button>
    </template>
    <div v-if="error" class="status-panel" role="alert">
      <p>
        {{
          [401, 403, 404].includes(error.statusCode ?? 0)
            ? '对话不存在或当前账号无法访问，请返回会话列表；'
            : '对话暂时无法读取，已显示的内容会保留。'
        }}
      </p>
      <button class="text-button" :disabled="status === 'pending'" @click="refresh()">
        重新连接
      </button>
    </div>
    <div v-if="pendingIntent" class="status-panel section">
      <p>提问结果待确认，请重试确认。</p>
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
      :owner-id="ownerId"
      :busy="generating"
      :stopping="stopping"
      :readonly="!!pendingIntent"
      :disabled="
        !!error ||
        !conversation ||
        submitting ||
        (!recoveryReady && !generating) ||
        (conversation.purpose === 'EXPLANATION' && !conversation.baseExplanation && !generating)
      "
      @image-pending="preparingImage = $event"
      @send="submit"
      @stop="chat.stop"
    />
  </div>
</template>
<style scoped>
.chat-heading-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 14px;
}
.chat-heading-actions .text-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--color-primary);
}
.regenerate-answer {
  min-height: 44px;
  margin-top: 4px;
}
.explanation-navigation {
  display: flex;
  flex-wrap: wrap;
  column-gap: 20px;
  row-gap: 8px;
  margin-top: 12px;
}
.explanation-base {
  padding: 20px;
  margin: 20px 0;
  min-width: 0;
}
.explanation-base h2 {
  font-size: 19px;
  margin-bottom: 10px;
}
.account-chat {
  min-width: 0;
  padding-bottom: max(0px, calc(var(--chat-composer-height, 70px) - 16px));
}
.chat-header {
  position: sticky;
  top: 0;
  z-index: 20;
  margin-top: calc(-28px - var(--safe-area-top));
  padding-top: calc(28px + var(--safe-area-top));
  padding-bottom: 8px;
  background: var(--color-background);
}
.chat-header :deep(.page-header) {
  margin-bottom: 12px;
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
  margin-top: 12px;
}
.chat-message {
  position: relative;
  margin-inline: 44px;
  min-width: 0;
  font-size: 16px;
  line-height: 1.75;
}
.chat-message.user {
  align-self: flex-end;
  max-width: 90%;
  padding: 12px 16px;
  background: #5b5ce2;
  color: #ffffff;
  border-radius: 18px 18px 4px 18px;
}
.chat-message.user p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.chat-message.assistant {
  padding: 14px 16px;
  background: #ffffff;
  border-radius: 4px 18px 18px;
  box-shadow: 0 4px 12px #40458c10;
}
.moxi-message-avatar {
  position: absolute;
  left: -44px;
  top: 0;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  background: #eef0ff;
  color: #5b5ce2;
  border-radius: 50%;
}
.user .moxi-message-avatar {
  left: auto;
  right: -44px;
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
.context-summary {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  padding: 0;
}
.chat-context .context-label {
  flex: 0 0 auto;
  font-size: 12px;
}
.chat-context:not([open]) .context-label {
  display: none;
}
.chat-context[open] .context-summary {
  display: none;
}
.chat-context[open] summary > .app-icon:last-child {
  transform: rotate(90deg);
}
.chat-context {
  padding: 9px 12px;
}
.explanation-question {
  width: fit-content;
  margin: 16px 0 16px auto;
}
</style>
