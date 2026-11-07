<script setup lang="ts">
import { chatSubmissionInvalidated } from '~/utils/account-cache'
import type { SavedConversation, VersionContext } from '#shared/types/tasks'
import type { SavedFormula } from '#shared/types/workspace'
import type { FormulaLibraryItem } from '#shared/types/library'
import { workspaceFeedback } from '~/utils/workspace-feedback'

const accountFetch = useAccountFetch()
const props = defineProps<{ ownerId: string; versionId: string; formulaId?: string }>()
const fetcher = useAccountFetch(),
  intents = useNuxtApp().$chatDraft
const {
  data: context,
  error: contextError,
  refresh: reloadContext,
} = await useAsyncData(
  'draft-context-' + props.ownerId + '-' + (props.formulaId || props.versionId),
  async () => {
    if (props.formulaId) {
      const formula = await fetcher<SavedFormula>(
        '/api/account/formulas/' + encodeURIComponent(props.formulaId),
        { retry: 0, timeout: 15000 },
      )
      const content = formula.versions.at(-1)

      if (!content) throw new Error('公式内容不存在')
      return {
        id: content.id,
        formulaId: formula.id,
        title: formula.title,
        number: content.number,
        latex: content.latex,
      }
    }
    return props.versionId
      ? fetcher<VersionContext>('/api/account/versions/' + encodeURIComponent(props.versionId), {
          retry: 0,
          timeout: 15000,
        })
      : null
  },
)
const {
  data: settings,
  error: settingsError,
  refresh: reloadSettings,
} = await useAsyncData('draft-chat-settings-' + props.ownerId, () =>
  fetcher<{ ready: boolean; provider: string }>('/api/account/chat-settings', {
    retry: 0,
    timeout: 15000,
  }),
)
const pending = computed(() =>
  intents.items.value.find((row) => row.ownerId === props.ownerId && row.slot === 'new'),
)

async function reload() {
  await Promise.all([reloadContext(), reloadSettings()])
}

const suggestions = computed(() =>
  context.value
    ? [
        { label: '解释符号含义', question: '请解释这个公式中各个符号的含义' },
        { label: '看看推导过程', question: '请一步步说明推导过程' },
      ]
    : [
        { label: '理解一个概念', question: '请用直观的例子解释导数的含义' },
        { label: '看看解题思路', question: '遇到一道数学题，应该怎样分析解题思路？' },
      ],
)
const draft = intents.question,
  busy = ref(false),
  feedback = ref(''),
  showPicker = ref(false),
  selecting = ref(false)
let disposed = false,
  sequence = 0,
  controller: AbortController | undefined

watch(
  pending,
  (value) => {
    if (value) draft.value = value.question
  },
  { immediate: true },
)

function beforeUnload(event: BeforeUnloadEvent) {
  if (draft.value.trim() && (!pending.value || intents.warning.value)) {
    event.preventDefault()
    event.returnValue = ''
  }
}

onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeRouteLeave((to) => {
  if (
    to.path !== '/ai/' + pending.value?.conversationId &&
    !pending.value &&
    draft.value.trim() &&
    !window.confirm('问题尚未发送，确定放弃草稿吗？')
  )
    return false
  sequence++
  controller?.abort()
})
onBeforeRouteUpdate(() => {
  sequence++
  controller?.abort()
})
onScopeDispose(() => {
  disposed = true
  controller?.abort()
  if (import.meta.client) window.removeEventListener('beforeunload', beforeUnload)
})

async function selectFormula(formula: FormulaLibraryItem) {
  if (pending.value || busy.value || selecting.value) return
  selecting.value = true
  controller = new AbortController()
  try {
    const saved = await fetcher<SavedFormula>('/api/account/formulas/' + formula.id, {
      signal: controller.signal,
      retry: 0,
      timeout: 15000,
    })

    if (disposed) return

    const latest = saved.versions.at(-1)

    if (!latest) throw new Error('缺少公式内容')
    showPicker.value = false
    await navigateTo({ path: '/ai/new', query: { formulaId: saved.id } }, { replace: true })
  } catch (error) {
    if (!disposed) feedback.value = workspaceFeedback(error, '公式暂时无法读取，请重试。')
  } finally {
    if (!disposed) selecting.value = false
  }
}

async function send() {
  if (
    busy.value ||
    disposed ||
    !intents.ready.value ||
    !settings.value?.ready ||
    settingsError.value ||
    contextError.value
  )
    return

  const question = pending.value?.question ?? draft.value.trim()

  if (!question || question.length > 2000) return

  const intent = pending.value ?? {
    ownerId: props.ownerId,
    slot: 'new',
    question,
    requestKey: crypto.randomUUID(),
    versionId: context.value?.id ?? null,
    conversationId: null,
  }

  busy.value = true

  const current = ++sequence

  feedback.value = ''
  controller = new AbortController()
  try {
    intents.put(intent)
    if (!intent.conversationId) {
      const saved = await accountFetch<SavedConversation>('/api/account/conversations', {
        method: 'POST',
        body: { formulaVersionId: intent.versionId, requestKey: intent.requestKey },
        retry: 0,
        timeout: 20000,
        signal: controller.signal,
      })

      if (disposed || current !== sequence) return
      intent.conversationId = saved.id
      intents.put({ ...intent })
    }
    await accountFetch('/api/account/conversations/' + intent.conversationId + '/messages', {
      method: 'POST',
      body: { question: intent.question, requestKey: intent.requestKey },
      retry: 0,
      timeout: 20000,
      signal: controller.signal,
    })
    if (disposed || current !== sequence) return
    clearNuxtData(chatSubmissionInvalidated)
    draft.value = ''
    // 先完成导航，再清掉用于离开守卫和刷新恢复的请求意图。
    await navigateTo('/ai/' + intent.conversationId, { replace: true })
    intents.remove(intent)
  } catch (error) {
    if (!disposed && current === sequence)
      feedback.value = workspaceFeedback(error, '发送尚未确认，请用原请求重试。')
  } finally {
    if (!disposed) busy.value = false
  }
}
</script>
<template>
  <div class="new-chat">
    <PageHeader title="新对话" :back-to="context ? '/formulas/' + context.formulaId : '/ai'" />
    <div v-if="context" class="card draft-context">
      <p class="info-note">{{ context.title }}</p>
      <MathFormula :latex="context.latex" />
    </div>
    <section class="new-chat-welcome">
      <span class="soft-icon"><AppIcon name="sparkles" :size="25" /></span>
      <h1>把公式，一步步读懂</h1>
      <p>解释符号、梳理推导，也可以直接提出你的问题。</p>
    </section>
    <button
      v-if="!context"
      class="button button-secondary button-block"
      :disabled="!!pending || busy || selecting"
      @click="showPicker = true"
    >
      <AppIcon name="book" :size="18" />
      选择库中公式
    </button>
    <div v-if="contextError || settingsError" class="status-panel section" role="alert">
      <p>公式或 AI 服务暂时不可用。</p>
      <button class="text-button" @click="reload">重新读取</button>
    </div>
    <p v-else-if="!settings?.ready" class="error-text section">AI 服务尚未就绪，暂时无法发送。</p>
    <p v-else-if="settings.provider !== 'deepseek'" class="info-note section">当前为模拟回答。</p>
    <p v-if="pending" class="info-note section">有一条提问待确认，重试不会重复创建对话。</p>
    <p v-if="feedback || intents.warning.value" class="error-text section" role="alert">
      {{ feedback || intents.warning.value }}
    </p>
    <button
      v-if="pending && !busy"
      class="button button-secondary section"
      :disabled="!settings?.ready"
      @click="send"
    >
      确认原提问
    </button>
    <div class="new-chat-controls">
      <div class="chip-list chat-suggestions" aria-label="建议提问">
        <button
          v-for="suggestion in suggestions"
          :key="suggestion.label"
          class="chip"
          :disabled="!!pending || busy"
          @click="draft = suggestion.question"
        >
          {{ suggestion.label }}
        </button>
      </div>
      <ChatComposer
        v-model="draft"
        :readonly="!!pending"
        :disabled="
          busy || !intents.ready.value || !!contextError || !!settingsError || !settings?.ready
        "
        :placeholder="busy ? '正在创建并发送…' : '输入你的问题…'"
        @send="send"
      />
    </div>
    <FormulaContextPicker
      v-if="showPicker"
      :owner-id="ownerId"
      @close="showPicker = false"
      @selected="selectFormula"
    />
  </div>
</template>
<style scoped>
.new-chat {
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - 56px);
  padding-bottom: calc(
    var(--chat-composer-height, 80px) + var(--bottom-nav-offset) + var(--safe-area-bottom) +
      var(--chat-keyboard-offset, 0px) + 100px
  );
}
.draft-context {
  padding: 16px;
  min-width: 0;
}
.new-chat-welcome {
  padding: 20px 0;
}
.new-chat-welcome h1 {
  font-size: clamp(22px, 5vw, 28px);
  margin: 18px 0 12px;
  line-height: 1.4;
}
.new-chat-welcome p {
  color: var(--color-text-secondary);
  line-height: 1.8;
  font-size: 14px;
}
.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.chip {
  min-height: 44px;
}
.info-note {
  line-height: 1.8;
}
.new-chat-controls {
  position: fixed;
  z-index: 21;
  bottom: calc(
    var(--bottom-nav-offset) + var(--safe-area-bottom) + var(--chat-keyboard-offset, 0px) + 12px
  );
  left: 50%;
  transform: translateX(-50%);
  display: grid;
  gap: 12px;
  width: min(calc(100% - 32px), calc(var(--app-width) - 48px));
}
.new-chat-controls :deep(.chat-composer) {
  position: static;
  transform: none;
  width: 100%;
}
.chat-suggestions {
  margin: 0;
  padding: 0;
}
.chat-suggestions .chip {
  flex: 1;
  font-size: 13px;
  min-width: 0;
  padding-inline: 8px;
}
</style>
