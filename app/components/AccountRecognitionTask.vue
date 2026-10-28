<script setup lang="ts">
import type { RecognitionTaskState } from '#shared/types/tasks'
import { safeReturnPath } from '#shared/navigation'
import {
  acceptRecognitionSnapshot,
  recognitionInvalidates,
  recognitionResultOrigin,
} from '~/utils/recognition-state'
import { workspaceFeedback } from '~/utils/workspace-feedback'
const props = defineProps<{ id: string; ownerId: string }>()
const owner = toRef(props, 'ownerId'),
  flow = useAccountRecognition(owner)
const fetcher = useRequestFetch()
const route = useRoute(),
  origins = useState<Record<string, string>>('page-origins', () => ({}))
function prepareResultReturn() {
  const origin = recognitionResultOrigin(origins.value, route.fullPath)
  if (origin)
    origins.value[route.fullPath] = safeReturnPath(origin, '/library?space=account&view=recent')
}
let disposed = false,
  accepted: RecognitionTaskState | undefined
const request = useTaskPolling<RecognitionTaskState>(
  'account-task-' + props.id + '-' + props.ownerId,
  '/api/account/tasks/' + encodeURIComponent(props.id),
  (task) => ['QUEUED', 'PROCESSING'].includes(task.status),
  {
    paused: computed(() => flow.stage.value !== 'idle'),
    read: async (signal) => {
      const task = await fetcher<RecognitionTaskState>(
        '/api/account/tasks/' + encodeURIComponent(props.id),
        { signal, retry: 0 },
      )
      signal.throwIfAborted()
      if (disposed) throw new Error('页面已离开')
      if (task.id !== props.id) throw new Error('任务响应不匹配')
      accepted = acceptRecognitionSnapshot(accepted, task)
      return accepted
    },
  },
)
const { data: task, error, status, refresh } = request
const feedback = ref(''),
  busy = computed(() => flow.stage.value !== 'idle')
const uncertain = computed(() => !!flow.retryReceipt(props.id))
const errorCode = computed(() => (error.value as { statusCode?: number } | null)?.statusCode)
const { recoveryWarning } = useNuxtApp().$uploadDraft
let lastState = ''
watch(
  task,
  (value) => {
    if (value) accepted = value
    if (!value || !import.meta.client) return
    const state = [value.status, value.attemptCount, value.formulaId].join(':')
    if (state !== lastState) {
      clearNuxtData((key) =>
        recognitionInvalidates(key, value.status === 'COMPLETED' ? 'completed' : 'changed'),
      )
      lastState = state
    }
  },
  { immediate: true },
)
async function retry() {
  if (!task.value || busy.value || error.value || status.value === 'pending') return
  feedback.value = ''
  try {
    const next = await flow.retry(task.value)
    if (disposed) return
    clearNuxtData((key) => recognitionInvalidates(key, 'submitted'))
    await navigateTo('/recognitions/' + encodeURIComponent(next.id), { replace: true })
  } catch (cause) {
    if (!disposed) feedback.value = workspaceFeedback(cause, '提交结果暂未确认，请沿用原请求重试。')
  }
}
onScopeDispose(() => {
  disposed = true
})
await request
</script>
<template>
  <div v-if="status === 'pending' && !task" class="card status-panel" role="status">
    正在读取识别任务…
  </div>
  <div v-if="error" class="card status-panel" role="alert">
    <h2>
      {{
        errorCode === 404
          ? '未找到这个任务'
          : errorCode === 401 || errorCode === 403
            ? '请重新确认登录'
            : '任务暂时无法连接'
      }}
    </h2>
    <p>
      {{
        errorCode === 404
          ? '记录不存在，或当前账号无权访问。'
          : '已暂停查询，连接问题不会新建任务或重复使用额度。'
      }}
    </p>
    <button
      v-if="errorCode !== 404"
      class="text-button"
      :disabled="status === 'pending'"
      @click="refresh()"
    >
      重新读取任务
    </button>
    <NuxtLink
      v-if="errorCode === 401 || errorCode === 403"
      :to="{ path: '/login', query: { redirect: $route.fullPath } }"
      class="text-button"
    >
      前往登录
    </NuxtLink>
  </div>
  <template v-if="task">
    <div class="card task-card">
      <TaskProgress :task="task" title="公式识别" compact />
      <RecognitionSteps :status="task.status" />
      <p class="task-note">
        {{ task.mode === 'handwritten' ? '手写公式' : '印刷公式' }} · 已尝试
        {{ task.attemptCount }} 次{{
          task.isMock && task.status === 'COMPLETED' ? ' · 模拟结果' : ''
        }}
      </p>
    </div>
    <NuxtLink
      v-if="task.status === 'COMPLETED' && task.formulaId && !error"
      :to="'/formulas/' + encodeURIComponent(task.formulaId)"
      @click="prepareResultReturn"
      class="button button-primary button-block section"
    >
      查看识别结果
      <AppIcon name="chevron" :size="18" />
    </NuxtLink>
    <p
      v-else-if="task.status === 'COMPLETED' && !task.formulaId"
      class="error-text section"
      role="alert"
    >
      结果暂时未关联，请重新读取任务。
    </p>
    <button
      v-if="task.status === 'FAILED'"
      class="button button-primary button-block section"
      :disabled="busy || !!error || status === 'pending' || !flow.recoveryReady.value"
      :aria-busy="busy"
      @click="retry"
    >
      {{ busy ? '正在提交…' : uncertain ? '确认上次重新提交' : '重新提交识别' }}
    </button>
    <p v-if="task.status === 'FAILED'" class="info-note section">
      {{
        uncertain
          ? '上次重新提交尚未确认，将沿用原请求确认结果，不创建另一个请求。'
          : '这是已确认失败的任务。重新提交将创建新任务，使用 1 次新的识别额度。'
      }}
    </p>
    <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
    <p
      v-if="recoveryWarning && recoveryWarning !== feedback"
      class="error-text section"
      role="alert"
    >
      {{ recoveryWarning }}
    </p>
    <div class="task-links">
      <button class="text-button" :disabled="busy || status === 'pending'" @click="refresh()">
        {{ status === 'pending' ? '正在读取…' : '刷新任务状态' }}
      </button>
      <NuxtLink to="/library?space=account&view=recent" class="text-button">
        最近识别
        <AppIcon name="chevron" :size="14" />
      </NuxtLink>
    </div>
    <p class="info-note task-footer">
      任务已保存在账号。你可以离开此页，稍后从最近识别继续查看；识别后请核对公式。
    </p>
  </template>
  <AccountUsage :owner-id="ownerId" />
</template>
<style scoped>
.task-card {
  padding: 20px 16px;
  min-width: 0;
}
.task-note {
  font-size: 12px;
  line-height: 1.8;
  color: var(--color-text-secondary);
  text-align: center;
}
.task-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  margin-top: 20px;
}
.task-footer {
  line-height: 1.9;
  margin-top: 12px;
}
</style>
