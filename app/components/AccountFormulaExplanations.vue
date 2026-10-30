<script setup lang="ts">
import type { ExplanationHistoryPage } from '#shared/types/tasks'
import type { SavedFormula } from '#shared/types/workspace'
import { chatSubmissionInvalidated } from '~/utils/account-cache'
import { workspaceFeedback } from '~/utils/workspace-feedback'
import { EXPLANATION_RECOVERY_KEY, parseExplanationIntent } from '~/utils/explanation-intent'
const props = defineProps<{ formula: SavedFormula; ownerId: string }>()
const route = useRoute()
const preferred =
  typeof route.query.explainVersion === 'string' &&
  props.formula.versions.some((v) => v.id === route.query.explainVersion)
    ? route.query.explainVersion
    : props.formula.versions.at(-1)!.id
const selected = ref(preferred),
  allVersions = ref(false)
const otherFormula = ref('')
const items = ref<ExplanationHistoryPage['items']>([]),
  cursor = ref<string | null>(null)
const loading = ref(false),
  sending = ref(false),
  error = ref(''),
  feedback = ref(''),
  ready = ref(false)
const pending = ref<ReturnType<typeof parseExplanationIntent>>(null)
const fetcher = useRequestFetch()
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
          ...(!allVersions.value ? { versionId: selected.value } : {}),
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
watch([selected, allVersions], () => {
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
    if (pending.value) selected.value = pending.value.versionId
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
    const result = await $fetch<{ conversationId: string }>(
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
  <section class="card explanation-entry" aria-label="结构化解释与历史">
    <header>
      <h2 id="explanation-create">AI 结构化解释</h2>
      <p class="info-note">
        解释符号、条件和推导。每次生成绑定所选版本，使用一次 AI 提问次数（解释与自由提问共用）。
      </p>
    </header>
    <label class="field">
      <span>解释公式版本</span>
      <select v-model="selected" :disabled="sending || !!pending" aria-label="解释公式版本">
        <option v-for="version in formula.versions" :key="version.id" :value="version.id">
          v{{ version.number }}{{ version.id === formula.versions.at(-1)?.id ? ' · 当前版本' : '' }}
        </option>
      </select>
    </label>
    <button
      class="button button-primary button-block"
      :disabled="sending || !ready"
      @click="generate"
    >
      {{ sending ? '正在确认提交…' : pending ? '确认原解释请求' : '生成新的结构化解释' }}
    </button>
    <NuxtLink v-if="otherFormula" :to="'/formulas/' + otherFormula" class="text-button">
      返回待确认公式
    </NuxtLink>
    <p v-if="pending" class="info-note">原请求待确认，重试沿用同一编号；已有结果不会重复扣额度。</p>
    <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
    <div class="history-heading">
      <h3 id="explanation-history">解释历史</h3>
      <label>
        <input v-model="allVersions" type="checkbox" />
        全部版本
      </label>
    </div>
    <p v-if="loading && !items.length" role="status">正在读取历史…</p>
    <p v-else-if="!items.length && !error" class="info-note">
      这个版本还没有解释。生成后可随时回来查看和追问。
    </p>
    <p v-if="error" class="error-text" role="alert">
      {{ error }}
      <button class="text-button" @click="load()">重新读取历史</button>
    </p>
    <ul v-if="items.length" class="explanation-history">
      <li v-for="item in items" :key="item.id">
        <NuxtLink :to="'/ai/' + item.id">
          <span>
            v{{ item.versionNumber }} · {{ labels[item.status] }} ·
            {{ item.isMock ? '模拟' : item.modelVersion || 'AI' }}
          </span>
          <small>{{ new Date(item.createdAt).toLocaleString('zh-CN') }}</small>
        </NuxtLink>
      </li>
    </ul>
    <button v-if="cursor" class="button button-secondary" :disabled="loading" @click="load(true)">
      加载更多解释
    </button>
  </section>
</template>
<style scoped>
.explanation-entry {
  padding: 20px;
  margin-top: 20px;
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
.field {
  display: grid;
  gap: 8px;
  margin: 18px 0;
}
select {
  min-width: 0;
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  padding: 10px;
  background: var(--color-surface);
  font: inherit;
  color: inherit;
}
.history-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin: 26px 0 12px;
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
</style>
