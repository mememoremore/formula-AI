<script setup lang="ts">
import { chatSubmissionInvalidated } from '~/utils/account-cache'
import type { SavedConversation, VersionContext } from '#shared/types/tasks'
import type { SavedFormula } from '#shared/types/workspace'
import type { FormulaLibraryItem } from '#shared/types/library'
import { workspaceFeedback } from '~/utils/workspace-feedback'
const props = defineProps<{ ownerId: string; versionId: string }>()
const route = useRoute(),
  fetcher = useRequestFetch(),
  intents = useNuxtApp().$chatDraft
const {
  data: context,
  error: contextError,
  refresh: reloadContext,
} = await useAsyncData('draft-context-' + props.ownerId + '-' + props.versionId, () =>
  props.versionId
    ? fetcher<VersionContext>('/api/account/versions/' + encodeURIComponent(props.versionId), {
        retry: 0,
        timeout: 15000,
      })
    : Promise.resolve(null),
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
    if (!latest) throw new Error('缺少公式版本')
    showPicker.value = false
    await navigateTo(
      { path: '/ai/new', query: { ...route.query, versionId: latest.id } },
      { replace: true },
    )
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
      const saved = await $fetch<SavedConversation>('/api/account/conversations', {
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
    await $fetch('/api/account/conversations/' + intent.conversationId + '/messages', {
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
      <p class="info-note">{{ context.title }} · v{{ context.number }}</p>
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
    <div class="chip-list section">
      <button
        class="chip"
        :disabled="!!pending || busy"
        @click="draft = '请解释这个公式中各个符号的含义'"
      >
        解释符号含义
      </button>
      <button class="chip" :disabled="!!pending || busy" @click="draft = '请一步步说明推导过程'">
        看看推导过程
      </button>
    </div>
    <div v-if="contextError || settingsError" class="status-panel section" role="alert">
      <p>公式版本或 AI 服务暂时不可用。</p>
      <button class="text-button" @click="reload">重新读取</button>
    </div>
    <p v-else-if="!settings?.ready" class="error-text section">AI 服务尚未就绪，暂时无法发送。</p>
    <p v-else class="info-note section">
      {{
        settings.provider === 'deepseek'
          ? '使用 DeepSeek，提问及公式上下文会发送给模型服务。'
          : '当前为固定模拟回答。'
      }}首次发送才创建账号对话。
    </p>
    <p v-if="pending" class="info-note section">
      有一条待确认的原提问。重试沿用原请求，不会另建对话；原问题和请求标识暂存于此标签页，确认成功后移除。
    </p>
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
    <ChatComposer
      v-model="draft"
      :readonly="!!pending"
      :disabled="
        busy || !intents.ready.value || !!contextError || !!settingsError || !settings?.ready
      "
      :placeholder="busy ? '正在创建并发送…' : '输入你的问题…'"
      @send="send"
    />
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
  padding-bottom: calc(var(--chat-composer-height, 80px) + 32px);
}
.draft-context {
  padding: 16px;
  min-width: 0;
}
.new-chat-welcome {
  padding: 32px 0 24px;
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
</style>
