<script setup lang="ts">
import type { ExplanationHistoryPage } from '#shared/types/tasks'
import type { SavedFormula } from '#shared/types/workspace'
import { chatSubmissionInvalidated } from '~/utils/account-cache'
import { workspaceFeedback } from '~/utils/workspace-feedback'
import { EXPLANATION_RECOVERY_KEY, parseExplanationIntent } from '~/utils/explanation-intent'

const accountFetch = useAccountFetch()
const props = defineProps<{ formula: SavedFormula; ownerId: string }>()
const route = useRoute()
const selected = computed(() => props.formula.versions.at(-1)!.id)
const otherFormula = ref('')
const items = ref<ExplanationHistoryPage['items']>([]),
  cursor = ref<string | null>(null)
const loading = ref(false),
  sending = ref(false),
  error = ref(''),
  feedback = ref(''),
  ready = ref(false)
const pending = ref<ReturnType<typeof parseExplanationIntent>>(null)
const fetcher = useAccountFetch()
let disposed = false,
  sequence = 0,
  controller: AbortController | undefined,
  submitController: AbortController | undefined

async function load(more = false) {
  if (more && (loading.value || !cursor.value)) return

  const ticket = ++sequence

  controller?.abort()
  controller = new AbortController()
  loading.value = true
  error.value = ''
  try {
    const data = await fetcher<ExplanationHistoryPage>(
      '/api/account/formulas/' + props.formula.id + '/explanations',
      {
        query: {
          ...(more ? { cursor: cursor.value } : {}),
        },
        signal: controller.signal,
        retry: 0,
        timeout: 15000,
      },
    )

    if (disposed || ticket !== sequence) return
    items.value = more
      ? [...new Map([...items.value, ...data.items].map((row) => [row.id, row])).values()]
      : data.items
    cursor.value = data.nextCursor
  } catch (cause) {
    if (!disposed && ticket === sequence)
      error.value = workspaceFeedback(cause, '解释历史暂时无法读取。')
  } finally {
    if (!disposed && ticket === sequence) loading.value = false
  }
}

watch(selected, () => {
  items.value = []
  cursor.value = null
  void load()
})
onMounted(() => {
  try {
    const raw = sessionStorage.getItem(EXPLANATION_RECOVERY_KEY)

    pending.value = parseExplanationIntent(raw, props.ownerId, props.formula.id)
    if (raw && !pending.value) {
      let other: unknown

      try {
        other = JSON.parse(raw)
      } catch {}

      const id =
        other && typeof other === 'object' && 'formulaId' in other ? other.formulaId : undefined

      if (typeof id === 'string' && parseExplanationIntent(raw, props.ownerId, id)) {
        otherFormula.value = id
        feedback.value = '另一个公式的提交尚未确认，请先返回该公式。'
        void load()
        return
      }
      sessionStorage.removeItem(EXPLANATION_RECOVERY_KEY)
    }
    ready.value = true
  } catch {
    feedback.value = '会话存储不可用，无法安全保存请求标识。'
  }
  void load()
})
onScopeDispose(() => {
  disposed = true
  sequence++
  controller?.abort()
  submitController?.abort()
})

async function generate() {
  if (sending.value || disposed || !ready.value) return

  const intent = pending.value ?? {
    ownerId: props.ownerId,
    formulaId: props.formula.id,
    versionId: selected.value,
    requestKey: crypto.randomUUID(),
  }

  sending.value = true
  feedback.value = ''
  submitController = new AbortController()
  try {
    sessionStorage.setItem(EXPLANATION_RECOVERY_KEY, JSON.stringify(intent))
    pending.value = intent

    const result = await accountFetch<{ conversationId: string }>(
      '/api/account/formulas/' + intent.formulaId + '/explanations',
      {
        method: 'POST',
        body: { versionId: intent.versionId, requestKey: intent.requestKey },
        headers: { 'x-account-id': props.ownerId },
        retry: 0,
        timeout: 20000,
        signal: submitController.signal,
      },
    )

    if (disposed || submitController.signal.aborted) return
    sessionStorage.removeItem(EXPLANATION_RECOVERY_KEY)
    pending.value = null
    clearNuxtData(chatSubmissionInvalidated)
    await navigateTo('/ai/' + result.conversationId)
  } catch (cause) {
    if (!disposed && !submitController.signal.aborted) {
      feedback.value = workspaceFeedback(cause, '提交结果尚未确认，请确认原请求。')

      const code =
        (cause as { statusCode?: number; status?: number }).statusCode ??
        (cause as { status?: number }).status

      if (code && code >= 400 && code < 500 && code !== 408) {
        try {
          sessionStorage.removeItem(EXPLANATION_RECOVERY_KEY)
          pending.value = null
        } catch {}
      }
    }
  } finally {
    if (!disposed) sending.value = false
  }
}

const labels = { QUEUED: '排队中', PROCESSING: '生成中', COMPLETED: '解释完成', FAILED: '未完成' }
</script>
<template>
  <section class="card explanation-entry" aria-label="AI 帮我理解">
    <header>
      <h2 id="explanation-create">AI 帮我理解</h2>
      <p class="info-note">每次解释或提问使用 1 次 AI 额度。</p>
    </header>
    <div class="explanation-actions">
      <button
        class="button button-primary button-block"
        :disabled="sending || !ready"
        @click="generate"
      >
        {{ sending ? '正在确认提交…' : pending ? '确认原解释请求' : '一键解释' }}
      </button>
      <NuxtLink
        :to="'/ai/new?formulaId=' + encodeURIComponent(formula.id)"
        class="button button-secondary button-block ask-question"
      >
        <AppIcon name="sparkles" :size="18" />
        继续提问
      </NuxtLink>
    </div>
    <NuxtLink v-if="otherFormula" :to="'/formulas/' + otherFormula" class="text-button">
      返回待确认公式
    </NuxtLink>
    <p v-if="pending" class="info-note">提交结果待确认，重试不会重复扣额度。</p>
    <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
    <details
      class="explanation-records"
      :open="!!error || route.hash === '#explanation-history' || undefined"
    >
      <summary class="history-heading">
        <h3 id="explanation-history">
          解释历史
          <span v-if="items.length">· {{ items.length }}</span>
        </h3>
        <AppIcon name="chevron" :size="15" />
      </summary>
      <p v-if="loading && !items.length" role="status">正在读取历史…</p>
      <p v-else-if="!items.length && !error" class="info-note">暂无解释记录。</p>
      <p v-if="error" class="error-text" role="alert">
        {{ error }}
        <button class="text-button" @click="load()">重新读取历史</button>
      </p>
      <ul v-if="items.length" class="explanation-history">
        <li v-for="item in items" :key="item.id">
          <NuxtLink :to="'/ai/' + item.id">
            <span>
              {{ labels[item.status] }}
              <span v-if="item.isMock">· 模拟</span>
            </span>
            <small>{{ new Date(item.createdAt).toLocaleString('zh-CN') }}</small>
          </NuxtLink>
        </li>
      </ul>
      <button v-if="cursor" class="button button-secondary" :disabled="loading" @click="load(true)">
        加载更多解释
      </button>
    </details>
  </section>
</template>
<style scoped>
.ask-question {
  margin-top: 0;
}
.explanation-entry {
  padding: 16px;
  margin-top: 14px;
  min-width: 0;
}
h2 {
  font-size: 19px;
}
h3 {
  font-size: 15px;
}
header p {
  margin-top: 10px;
  line-height: 1.8;
}
.history-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin: 14px 0 0;
}
label {
  font-size: 13px;
}
input {
  margin-right: 6px;
}
.explanation-history {
  list-style: none;
  padding: 0;
}
.explanation-history a {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 14px 0;
  border-bottom: 1px solid var(--color-border);
  min-height: 44px;
  overflow-wrap: anywhere;
}
small {
  color: var(--color-text-secondary);
  font-size: 12px;
}
.info-note,
.error-text {
  margin-top: 12px;
  line-height: 1.8;
}
.explanation-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.explanation-actions .button {
  min-width: 0;
  padding-inline: 6px;
  font-size: 14px;
}
.explanation-records summary {
  min-height: 44px;
  cursor: pointer;
  list-style: none;
  color: var(--color-text-secondary);
}
.explanation-records[open] summary .app-icon {
  transform: rotate(90deg);
}
.explanation-records summary::-webkit-details-marker {
  display: none;
}
</style>
