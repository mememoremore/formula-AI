<script setup lang="ts">
import { recognitionHistoryTitle, recognitionResultPresentation } from '#shared/recognition-result'
import { workspaceFeedback } from '~/utils/workspace-feedback'

const props = defineProps<{ ownerId: string; query: string }>()
const {
  request,
  items,
  loadingMore: loading,
  feedback,
  more,
  reload,
  deleting,
  removeRecords,
} = useAccountHistory(props.ownerId, props.query)
const { error, status } = request
const cursor = computed(() => request.data.value?.nextCursor ?? null)
const labels = { QUEUED: '排队中', PROCESSING: '识别中', COMPLETED: '已完成', FAILED: '识别失败' }
const selecting = ref(false),
  selected = ref<string[]>([]),
  confirmOpen = ref(false),
  deleteError = ref(''),
  pendingDelete = ref<string[]>([])
const { showToast } = useToast()
const hasActive = computed(() =>
  items.value.some(
    (item) =>
      pendingDelete.value.includes(item.id) && ['QUEUED', 'PROCESSING'].includes(item.status),
  ),
)

watch(items, (records) => {
  const visible = new Set(records.map((item) => item.id))

  selected.value = selected.value.filter((id) => visible.has(id))
})

function toggleSelection() {
  if (deleting.value) return
  selecting.value = !selecting.value
  selected.value = []
  deleteError.value = ''
}

function selectAll() {
  selected.value = items.value.slice(0, 100).map((item) => item.id)
}

function openRecord(event: MouseEvent, id: string) {
  if (!selecting.value) return
  event.preventDefault()
  if (deleting.value) return
  if (selected.value.includes(id)) selected.value = selected.value.filter((value) => value !== id)
  else if (selected.value.length < 100) selected.value.push(id)
}

function askDelete() {
  pendingDelete.value = [...selected.value]
  deleteError.value = ''
  confirmOpen.value = true
}

async function confirmDelete() {
  if (deleting.value || !pendingDelete.value.length) return
  deleteError.value = ''
  try {
    if (!(await removeRecords(pendingDelete.value))) return
    confirmOpen.value = false
    selecting.value = false
    selected.value = []
    showToast('已删除所选识别记录。')
  } catch (cause) {
    deleteError.value = workspaceFeedback(cause, '暂时无法删除，请重试。')
  }
}

await request
</script>
<template>
  <div class="section-heading">
    <h2>识别记录</h2>
    <div class="row history-actions">
      <button
        class="text-button"
        :disabled="deleting || (!items.length && !selecting)"
        @click="toggleSelection"
      >
        {{ selecting ? '取消' : '批量操作' }}
      </button>
    </div>
  </div>
  <BulkSelectionBar
    v-if="selecting"
    :count="selected.length"
    :busy="deleting"
    :available="items.length"
    @select-all="selectAll"
    @remove="askDelete"
  />
  <div v-if="status === 'pending' && !items.length" class="card status-panel" role="status">
    正在读取识别记录…
  </div>
  <div v-if="error" class="status-panel card" role="alert">
    <p>暂时无法读取识别记录。</p>
    <button class="text-button" :disabled="status === 'pending' || loading" @click="reload">
      重新加载
    </button>
  </div>
  <LibraryGrid v-if="items.length">
    <article
      v-for="item in items"
      :key="item.id"
      class="card history-item"
      :class="{ 'is-selected': selected.includes(item.id), selectable: selecting }"
    >
      <label v-if="selecting" class="history-checkbox">
        <input
          v-model="selected"
          type="checkbox"
          :value="item.id"
          :disabled="deleting || (selected.length >= 100 && !selected.includes(item.id))"
          :aria-label="'选择识别记录：' + recognitionHistoryTitle(item)"
        />
      </label>
      <NuxtLink
        :to="
          item.formulaId && item.status === 'COMPLETED'
            ? '/formulas/' + item.formulaId
            : '/recognitions/' + item.id
        "
        class="history-link"
        @click="openRecord($event, item.id)"
      >
        <div v-if="!selecting" class="row between">
          <h3>{{ recognitionHistoryTitle(item) }}</h3>
          <AppIcon v-if="!selecting" name="chevron" :size="16" />
        </div>
        <MathFormula v-if="item.latex" :latex="item.latex" :display="false" />
        <p v-if="!selecting && item.status === 'FAILED'" class="error-text">
          {{ item.errorMessage || '请打开任务查看原因并重试。' }}
        </p>
        <div v-if="!selecting" class="history-meta">
          <span :class="{ failed: item.status === 'FAILED' }">
            {{ recognitionResultPresentation(item)?.label || labels[item.status] }}
          </span>
          <span>{{ item.createdAt.slice(0, 10) }}</span>
        </div>
        <p v-if="selecting && !item.latex" class="info-note">暂无公式预览</p>
      </NuxtLink>
    </article>
  </LibraryGrid>
  <button
    v-if="cursor"
    class="button button-secondary button-block section"
    :disabled="loading || deleting || status === 'pending'"
    @click="more"
  >
    {{ loading ? '正在加载…' : '加载更多' }}
  </button>
  <EmptyState
    v-if="!items.length && !error && status !== 'pending'"
    :title="query ? '没有找到匹配的识别记录' : '等待第一张公式图片'"
    :description="query ? '试试其他关键词；' : '识别中的任务、完成结果与失败记录都会留在这里。'"
    :action-label="query ? undefined : '上传公式图片'"
    :action-to="query ? undefined : '/upload'"
  />
  <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
  <AppModal
    :open="confirmOpen"
    title="删除所选识别记录？"
    @close="!deleting && (confirmOpen = false)"
  >
    <p>
      将从识别记录和首页移除
      {{ pendingDelete.length }} 条记录，不进入回收站且无法恢复；对应公式、原图、对话与导出保留。
    </p>
    <p v-if="hasActive" class="info-note">进行中的识别仍会继续，移除记录不会停止识别。</p>
    <p v-if="deleteError" class="error-text" role="alert">{{ deleteError }}</p>
    <div class="row delete-actions">
      <button class="button button-secondary" :disabled="deleting" @click="confirmOpen = false">
        取消
      </button>
      <button class="button button-primary" :disabled="deleting" @click="confirmDelete">
        {{ deleting ? '删除中…' : '确认删除' }}
      </button>
    </div>
  </AppModal>
</template>
<style scoped>
.history-item {
  position: relative;
  display: block;
}
.history-link {
  display: block;
  padding: 16px;
}
.history-item.selectable .history-link {
  padding-left: 48px;
}
.history-item.is-selected {
  outline: 2px solid var(--color-primary);
}
.history-checkbox {
  position: absolute;
  top: 16px;
  left: 12px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
}
.history-checkbox input {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
}
.history-actions {
  gap: 12px;
}
.history-actions .text-button {
  font-size: 13px;
}
.delete-actions {
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}
h3 {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.history-item :deep(.math-formula) {
  margin-top: 15px;
}
.history-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--color-muted);
  margin-top: 16px;
}
.history-meta > span:first-child {
  color: #8b75ba;
}
.history-meta > span.failed {
  color: var(--color-danger);
}
.history-item .error-text {
  margin-top: 14px;
}
</style>
