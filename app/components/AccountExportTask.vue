<script setup lang="ts">
import { usageInvalidated } from '~/utils/account-cache'
import type { ExportTaskState } from '#shared/types/tasks'
import {
  acceptExportSnapshot,
  exportDownloadPath,
  exportFilename,
  EXPORT_RECOVERY_KEY,
  parseExportReceipts,
} from '~/utils/export-state'
import { workspaceFeedback } from '~/utils/workspace-feedback'
const props = defineProps<{ id: string; ownerId: string }>()
const fetcher = useRequestFetch(),
  session = useAccountSession()
let disposed = false,
  accepted: ExportTaskState | undefined
const current = () =>
  !disposed && !session.error.value && session.data.value?.user?.id === props.ownerId
const busy = ref(false),
  downloading = ref(false),
  feedback = ref(''),
  downloadFeedback = ref(''),
  uncertain = ref(false)
const controller = new AbortController()
const objectUrls = new Set<string>()
const request = useTaskPolling<ExportTaskState>(
  `account-export-${props.id}-${props.ownerId}`,
  '/api/account/exports/' + encodeURIComponent(props.id),
  (task) => ['QUEUED', 'PROCESSING'].includes(task.status),
  {
    paused: busy,
    read: async (signal) => {
      const next = await fetcher<ExportTaskState>(
        '/api/account/exports/' + encodeURIComponent(props.id),
        { signal, retry: 0 },
      )
      signal.throwIfAborted()
      if (!current() || next.id !== props.id) throw new Error('导出任务响应已失效')
      accepted = acceptExportSnapshot(accepted, next)
      return accepted
    },
  },
)
const { data: task, error, status, refresh } = request
const errorCode = computed(() => (error.value as { statusCode?: number } | null)?.statusCode)
const downloadPath = computed(() => (task.value ? exportDownloadPath(task.value) : null))
watch(
  task,
  (value, previous) => {
    if (!value) return
    accepted = value
    if (import.meta.client && previous && value.status !== previous.status)
      clearNuxtData(usageInvalidated)
  },
  { immediate: true },
)
onMounted(() => {
  try {
    uncertain.value = parseExportReceipts(sessionStorage.getItem(EXPORT_RECOVERY_KEY)).some(
      (row) => row.ownerId === props.ownerId && row.taskId === props.id,
    )
  } catch {
    feedback.value = '无法读取上次提交记录。为避免重复导出，暂不提交；请先在原会话确认任务。'
  }
})
async function retry() {
  if (busy.value || !task.value || task.value.status !== 'FAILED' || error.value || !current())
    return
  busy.value = true
  feedback.value = ''
  let sent = false
  try {
    const rows = parseExportReceipts(sessionStorage.getItem(EXPORT_RECOVERY_KEY))
    let receipt = rows.find((row) => row.ownerId === props.ownerId && row.taskId === props.id)
    if (receipt && receipt.versionId !== task.value.formulaVersionId)
      throw new Error('提交记录与当前公式版本不一致')
    if (!receipt) {
      if (rows.length >= 10) throw new Error('未确认的导出提交过多，请先确认原任务')
      receipt = {
        ownerId: props.ownerId,
        taskId: props.id,
        versionId: task.value.formulaVersionId,
        requestKey: crypto.randomUUID(),
      }
      rows.push(receipt)
    }
    // 先保存幂等回执；存储不可用时拒绝创建任务。
    sessionStorage.setItem(EXPORT_RECOVERY_KEY, JSON.stringify(rows))
    uncertain.value = true
    sent = true
    const next = await $fetch<ExportTaskState>('/api/account/exports', {
      method: 'POST',
      body: { formulaVersionId: receipt.versionId, requestKey: receipt.requestKey },
      retry: 0,
      timeout: 20000,
      signal: controller.signal,
    })
    if (!current()) return
    if (!next.id || next.formulaVersionId !== receipt.versionId)
      throw new Error('提交结果与公式版本不一致')
    try {
      sessionStorage.setItem(
        EXPORT_RECOVERY_KEY,
        JSON.stringify(rows.filter((row) => row !== receipt)),
      )
    } catch {
      /* 已确认结果仍可安全打开。 */
    }
    clearNuxtData(usageInvalidated)
    await navigateTo('/exports/' + encodeURIComponent(next.id), { replace: true })
  } catch (cause) {
    if (current())
      feedback.value = !sent
        ? '无法安全读取或保存提交记录，本次未发送新请求。请先确认原任务；不要清除记录后盲目重试。'
        : workspaceFeedback(cause, '提交结果尚未确认，请使用原请求再次确认，不要另开页面重复提交。')
  } finally {
    if (current()) busy.value = false
  }
}
async function download() {
  if (downloading.value || !downloadPath.value || !task.value || error.value || !current()) return
  downloading.value = true
  downloadFeedback.value = ''
  try {
    const blob = await $fetch<Blob>(downloadPath.value, {
      responseType: 'blob',
      retry: 0,
      timeout: 30000,
      signal: controller.signal,
    })
    if (!current()) return
    if (
      !blob.size ||
      !blob.type.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    )
      throw new Error('下载内容不是有效的 Word 响应')
    const url = URL.createObjectURL(blob)
    objectUrls.add(url)
    const link = document.createElement('a')
    link.href = url
    link.download = exportFilename(task.value.file?.name ?? task.value.title)
    link.click()
    setTimeout(() => {
      URL.revokeObjectURL(url)
      objectUrls.delete(url)
    }, 1000)
    downloadFeedback.value = '已请求浏览器下载，请在浏览器下载列表中查看文件。'
  } catch (cause) {
    if (current())
      downloadFeedback.value = workspaceFeedback(
        cause,
        '下载暂时失败，可以重试；不会重新生成文档或使用新额度。',
      )
  } finally {
    if (current()) downloading.value = false
  }
}
onScopeDispose(() => {
  disposed = true
  controller.abort()
  for (const url of objectUrls) URL.revokeObjectURL(url)
  objectUrls.clear()
})
await request
</script>
<template>
  <PageHeader
    title="Word 导出"
    :back-to="task?.formulaId ? '/formulas/' + task.formulaId : '/library'"
  />
  <div v-if="status === 'pending' && !task" class="card export-notice" role="status">
    正在读取导出任务…
  </div>
  <div v-if="error" class="card export-notice stack" role="alert">
    <h2>
      {{
        errorCode === 404
          ? '未找到这个导出任务'
          : errorCode === 401 || errorCode === 403
            ? '请重新确认登录'
            : '任务暂时无法连接'
      }}
    </h2>
    <p>
      {{
        errorCode === 404
          ? '任务不存在，或当前账号无权访问。'
          : '已暂停查询。重新读取不会创建任务，也不会使用新额度。'
      }}
    </p>
    <button
      v-if="errorCode !== 404"
      class="button button-secondary"
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
    <ExportResult
      v-if="task.status === 'COMPLETED'"
      :task="task"
      :downloadable="!!downloadPath && !error"
      :busy="downloading"
      @download="download"
    />
    <section v-else class="card export-notice">
      <TaskProgress :task="task" title="Word 文档" compact />
      <p class="muted">文档按已保存的公式版本生成，离开后可以通过原链接继续查看。</p>
    </section>
    <p v-if="downloadFeedback" class="info-note section" role="status">{{ downloadFeedback }}</p>
    <p v-if="task.status === 'COMPLETED' && !downloadPath" class="error-text section" role="alert">
      文件暂时不可下载，请重新读取任务；不要重复提交导出。
    </p>
    <div class="card export-details section">
      <span class="badge">固定版本 v{{ task.versionNumber }}</span>
      <h2>{{ task.title }}</h2>
      <p>之后编辑公式，不会改变这份文档。下载已生成的文件不使用新额度。</p>
      <NuxtLink :to="'/formulas/' + encodeURIComponent(task.formulaId)" class="text-button">
        返回公式详情
        <AppIcon name="arrowRight" :size="16" />
      </NuxtLink>
    </div>
    <button
      v-if="task.status === 'FAILED'"
      class="button button-primary button-block section"
      :disabled="busy || !!error || status === 'pending'"
      :aria-busy="busy"
      @click="retry"
    >
      {{ busy ? '正在确认…' : uncertain ? '确认上次重新提交' : '重新提交导出' }}
    </button>
    <p v-if="task.status === 'FAILED'" class="info-note section">
      {{
        uncertain
          ? '将沿用上次请求确认结果，不创建另一个请求。'
          : '已确认本次失败。重新提交仍使用此版本，并使用 1 次新的导出额度。'
      }}
    </p>
    <button class="text-button section" :disabled="busy || status === 'pending'" @click="refresh()">
      重新读取任务
    </button>
  </template>
  <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
  <AccountUsage :owner-id="ownerId" />
</template>
<style scoped>
.export-notice,
.export-details {
  padding: clamp(18px, 5vw, 28px);
}
.export-notice p,
.export-details p {
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.9;
}
.export-notice h2,
.export-details h2 {
  font-size: 18px;
  overflow-wrap: anywhere;
}
.export-details {
  display: grid;
  justify-items: start;
  gap: 12px;
}
.export-details .text-button {
  min-height: 44px;
}
</style>
