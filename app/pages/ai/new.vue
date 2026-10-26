<script setup lang="ts">
import type { SavedConversation, VersionContext } from '#shared/types/tasks'
import type { FormulaLibraryItem } from '#shared/types/library'
import type { SavedFormula } from '#shared/types/workspace'
import { workspaceFeedback } from '~/utils/workspace-feedback'
definePageMeta({ middleware: 'workspace', bottomNav: false, alias: '/account/chat' })
useHead({ title: '新对话 · Formula AI' })
const route = useRoute()
const { data: account, error: sessionError, demo } = useWorkspace()
await useAccountSession()
if (!account.value?.user && !demo.value && !sessionError.value)
  await navigateTo('/login?redirect=' + encodeURIComponent(route.fullPath), { replace: true })
const versionId = computed(() =>
  typeof route.query.versionId === 'string' ? route.query.versionId : '',
)
if (versionId.value && !account.value?.user && !sessionError.value)
  await navigateTo('/login?redirect=' + encodeURIComponent(route.fullPath), { replace: true })
const request = useRequestFetch()
const { data: context, error: contextError } = await useAsyncData<VersionContext | null>(
  () => 'draft-context-' + versionId.value,
  () =>
    versionId.value && !demo.value
      ? request('/api/account/versions/' + encodeURIComponent(versionId.value))
      : Promise.resolve(null),
)
const { data: settings, error: settingsError } = await useAsyncData('draft-chat-settings', () =>
  account.value?.user && !demo.value
    ? request<{ ready: boolean; provider: string }>('/api/account/chat-settings')
    : Promise.resolve(null),
)
const draft = ref('')
const busy = ref(false)
const feedback = ref('')
const showPicker = ref(false)
let requestKey = ''
const created = shallowRef<SavedConversation | null>(null)
let firstQuestion = ''
onBeforeRouteLeave((to) => {
  if (busy.value && to.path !== '/ai/' + created.value?.id) return false
  if (to.path === '/ai/' + created.value?.id || !draft.value.trim()) return
  return window.confirm('问题尚未发送，确定放弃草稿吗？')
})
async function selectFormula(formula: FormulaLibraryItem) {
  if (created.value) return
  showPicker.value = false
  requestKey = ''
  try {
    const saved = await request<SavedFormula>('/api/account/formulas/' + formula.id)
    const latest = saved.versions.at(-1)
    if (!latest) throw new Error('Missing version')
    await navigateTo(
      { path: '/ai/new', query: { ...route.query, versionId: latest.id } },
      { replace: true },
    )
  } catch {
    feedback.value = '这个公式暂时无法读取，请重新选择。'
  }
}
async function send() {
  const question = firstQuestion || draft.value.trim()
  if (
    !question ||
    question.length > 2000 ||
    busy.value ||
    contextError.value ||
    !settings.value?.ready
  )
    return
  busy.value = true
  feedback.value = ''
  requestKey ||= crypto.randomUUID()
  try {
    created.value ||= await $fetch<SavedConversation>('/api/account/conversations', {
      method: 'POST',
      body: { formulaVersionId: context.value?.id ?? null, requestKey },
      retry: 0,
      timeout: 20000,
    })
    firstQuestion = question
    await $fetch('/api/account/conversations/' + created.value.id + '/messages', {
      method: 'POST',
      body: { question: firstQuestion, requestKey },
      retry: 0,
      timeout: 20000,
    })
    clearNuxtData('account-conversations')
    clearNuxtData('account-usage')
    clearNuxtData('home-recent')
    await navigateTo('/ai/' + created.value.id, { replace: true })
  } catch (error) {
    feedback.value = workspaceFeedback(error, '发送暂时未能确认，请重试；不会重复创建同一请求。')
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <DemoChat v-if="demo && !versionId && !sessionError" />
  <div v-else class="new-chat">
    <PageHeader title="新对话" :back-to="context ? '/formulas/' + context.formulaId : '/ai'" />
    <div v-if="context" class="draft-context">
      <p class="info-note">{{ context.title }} · v{{ context.number }}</p>
      <MathFormula :latex="context.latex" />
    </div>
    <section class="new-chat-welcome">
      <PaperArtwork kind="idea" />
      <h2>想理解哪一道公式？</h2>
      <p>
        从一个问题开始，
        <br />
        一起理清每一步思路。
      </p>
      <button
        v-if="!context"
        class="button button-secondary"
        :disabled="!!created"
        @click="showPicker = true"
      >
        <AppIcon name="book" :size="18" />
        选择库中公式
      </button>
    </section>
    <div class="chip-list">
      <button class="chip" :disabled="!!created" @click="draft = '请解释这个公式中各个符号的含义'">
        解释符号含义
      </button>
      <button class="chip" :disabled="!!created" @click="draft = '请一步步说明推导过程'">
        看看推导过程
      </button>
    </div>
    <p v-if="contextError" class="error-text section" role="alert">
      指定公式版本不可用，请返回公式库重新选择。
    </p>
    <p v-if="sessionError || settingsError" class="error-text section" role="alert">
      暂时无法读取账号或 AI 服务，请刷新重试。
    </p>
    <p v-else-if="!settings?.ready" class="error-text section">AI 服务尚未就绪，暂时无法发送。</p>
    <p v-else class="info-note section">
      {{
        settings.provider === 'deepseek'
          ? '内容由 DeepSeek 生成，问题与公式上下文将发送给模型服务。'
          : '当前使用固定模拟回答。'
      }}对话保存在账号中。
    </p>
    <p v-if="feedback" class="error-text section" role="alert">
      {{ feedback }}{{ created ? ' 重试会继续发送原问题，避免重复创建。' : '' }}
    </p>
    <ChatComposer
      v-model="draft"
      :readonly="!!created && !!feedback"
      :disabled="busy || !!contextError || !!sessionError || !!settingsError || !settings?.ready"
      :placeholder="busy ? '正在发送…' : '输入你的问题…'"
      @send="send"
    />
    <FormulaContextPicker v-if="showPicker" @close="showPicker = false" @selected="selectFormula" />
  </div>
</template>
<style scoped>
.new-chat {
  padding-bottom: calc(var(--chat-composer-height, 70px) + 42px);
}
.draft-context {
  padding: 16px;
  border: 1px solid #e8e3f3;
  border-radius: 15px;
  background: #ffffff80;
}
.new-chat-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 10px 0 32px;
}
h2 {
  margin-top: 10px;
  font-size: 23px;
}
.new-chat-welcome p {
  margin: 14px 0 22px;
  font-size: 14px;
  line-height: 1.9;
  color: var(--color-muted);
}
</style>
