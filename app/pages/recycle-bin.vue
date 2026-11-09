<script setup lang="ts">
import { displayFormulaTitle } from '#shared/formula-title'
import { workspaceFeedback } from '~/utils/workspace-feedback'
import type { RecycleBinView } from '#shared/recycle-bin'

definePageMeta({ middleware: 'auth', contentWidth: 'reading' })
useHead({ title: '回收站 · 墨析' })

const session = await useAccountSession(),
  owner = session.data.value?.user?.id,
  fetcher = useAccountFetch(),
  invalidate = useFormulaViewsInvalidation()
const request = await useAsyncData('recycle:' + owner, async () => {
  const data = await fetcher<RecycleBinView>('/api/account/recycle-bin', {
    headers: { 'x-account-id': owner ?? '' },
    retry: 0,
  })

  if (session.data.value?.user?.id !== owner) throw new Error('账号已变化，请刷新页面。')
  return data
})
const busy = ref(false),
  feedback = ref(''),
  selected = ref<string[]>([]),
  action = ref<'restore' | 'clear' | null>(null),
  now = ref(Date.parse(request.data.value?.serverNow ?? '') || Date.now())
let serverBase = now.value,
  observedAt = Date.now(),
  timer: ReturnType<typeof setInterval> | undefined

watch(
  () => request.data.value,
  (data) => {
    if (data) {
      serverBase = Date.parse(data.serverNow)
      observedAt = Date.now()
      now.value = serverBase
    }
  },
)

const items = computed(
  () => request.data.value?.items.filter((row) => Date.parse(row.expiresAt) > now.value) ?? [],
)

const allSelected = computed(
  () => items.value.length > 0 && items.value.every((row) => selected.value.includes(row.id)),
)

watch(items, (rows) => {
  const visible = new Set(rows.map((row) => row.id))

  selected.value = selected.value.filter((id) => visible.has(id))
})
onMounted(() => {
  timer = setInterval(() => {
    now.value = serverBase + Math.max(0, Date.now() - observedAt)
    if (
      request.data.value?.items.some((row) => Date.parse(row.expiresAt) <= now.value) &&
      !busy.value &&
      request.status.value !== 'pending'
    )
      void request.refresh()
  }, 1000)
})
onScopeDispose(() => clearInterval(timer))

async function commit() {
  if (busy.value || !action.value) return

  const operation = action.value

  busy.value = true
  feedback.value = ''
  try {
    if (operation === 'clear') {
      await fetcher('/api/account/recycle-bin/clear', {
        method: 'POST',
        headers: { 'x-account-id': owner ?? '' },
        body: { confirmed: true },
        retry: 0,
      })
    } else {
      const ids = items.value.filter((row) => selected.value.includes(row.id)).map((row) => row.id)

      if (!ids.length) {
        action.value = null
        return
      }
      await fetcher('/api/account/recycle-bin/restore', {
        method: 'POST',
        headers: { 'x-account-id': owner ?? '' },
        body: { kind: 'formula', ids },
        retry: 0,
      })
    }
    selected.value = []
    action.value = null
    await invalidate(owner)
    clearNuxtData((key) => key === 'review:' + owner || key === 'tasks:' + owner)
    await request.refresh()
  } catch (error) {
    feedback.value = workspaceFeedback(error, '操作暂未完成，请核对当前回收站后重试。')
    action.value = null
    await request.refresh()
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <PageHeader title="回收站" back-to="/profile" />
  <p class="info-note">仅保留删除的公式，10天后自动清空；恢复不会自动收藏，清空后不能再恢复。</p>
  <div class="recycle-actions section">
    <button
      class="text-button"
      :disabled="busy || !items.length"
      @click="selected = allSelected ? [] : items.map((row) => row.id)"
    >
      {{ allSelected ? '取消全选' : '全选' }}
    </button>
    <button
      class="button button-secondary"
      :disabled="busy || !selected.length"
      @click="action = 'restore'"
    >
      恢复
    </button>
    <button class="text-button" :disabled="busy || !items.length" @click="action = 'clear'">
      清空
    </button>
  </div>
  <p v-if="request.error.value" class="error-text">回收站暂时无法读取，请刷新页面重试。</p>
  <p v-if="request.data.value?.hasMore" class="info-note">
    当前展示最近100条公式，恢复后可查看其余条目；清空会处理全部回收站公式。
  </p>
  <div class="stack section">
    <label v-for="row in items" :key="row.id" class="card recycle-row">
      <input
        v-model="selected"
        type="checkbox"
        :value="row.id"
        :disabled="busy"
        :aria-label="'选择公式：' + displayFormulaTitle(row.title)"
      />
      <span class="recycle-content">
        <strong>{{ displayFormulaTitle(row.title) }}</strong>
        <MathFormula v-if="row.latex" :latex="row.latex" />
        <span v-else class="info-note">公式内容暂时不可用</span>
        <small>删除时间：{{ new Date(row.deletedAt).toLocaleString('zh-CN') }}</small>
        <small>自动清空：{{ new Date(row.expiresAt).toLocaleString('zh-CN') }}</small>
      </span>
    </label>
  </div>
  <EmptyState v-if="request.data.value && !items.length" title="回收站是空的" />
  <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
  <AppModal
    :open="action !== null"
    :title="action === 'clear' ? '清空回收站' : '恢复所选公式'"
    @close="!busy && (action = null)"
  >
    <div class="stack">
      <p>
        {{
          action === 'clear'
            ? '清空后，回收站中的全部公式将不能恢复；已有对话和导出记录保留。'
            : '所选公式将恢复到公式库；原图、笔记和版本保留，不会自动收藏。'
        }}
      </p>
      <button class="button button-primary" :disabled="busy" @click="commit">
        {{ busy ? '正在处理…' : action === 'clear' ? '确认清空' : '确认恢复' }}
      </button>
    </div>
  </AppModal>
</template>
<style scoped>
.recycle-actions {
  display: flex;
  align-items: center;
  gap: 20px;
}
.recycle-row {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 16px;
  font-size: 14px;
  min-width: 0;
}
.recycle-content {
  display: block;
  min-width: 0;
  flex: 1;
}
.recycle-content strong {
  display: block;
  overflow-wrap: anywhere;
}
small {
  display: block;
  color: var(--color-text-secondary);
  margin-top: 8px;
  font-size: 12px;
}
</style>
