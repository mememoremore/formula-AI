<script setup lang="ts">
import type { ConversationPage } from '#shared/types/tasks'
import { conversationNameInputSchema } from '#shared/schemas/conversation-name'
import { workspaceFeedback } from '~/utils/workspace-feedback'

type Conversation = ConversationPage['items'][number]

const props = defineProps<{ ownerId: string }>()
const route = useRoute(),
  router = useRouter(),
  accountFetch = useAccountFetch()
const listing = useConversationListing(props.ownerId)
const { items, cursor, loading, feedback } = listing
const { error, status, refresh } = listing.request
const query = ref(listing.query.value)
const editing = ref<Conversation | null>(null),
  removing = ref<Conversation | null>(null)
const name = ref(''),
  mutationError = ref(''),
  busy = ref(false),
  swipeId = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
let touch: { id: string; x: number; y: number; horizontal: boolean } | undefined
let ignoreTapUntil = 0
let submittedQuery = query.value

watch(listing.query, (value, previous) => {
  if (query.value.trim() === submittedQuery || query.value.trim() === previous) query.value = value
  swipeId.value = ''
})
onScopeDispose(() => clearTimeout(searchTimer))

async function search() {
  clearTimeout(searchTimer)
  submittedQuery = query.value.trim()
  await router.replace({ query: { ...route.query, q: submittedQuery || undefined } })
}

function scheduleSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void search(), 250)
}

function clearSearch() {
  query.value = ''
  void search()
}

function timestamp(item: Conversation) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(item.updatedAt ?? item.createdAt))
}

function consumeTap(event: Event) {
  if (Date.now() < ignoreTapUntil || swipeId.value) {
    event.preventDefault()
    swipeId.value = ''
    return true
  }
  return false
}

function startSwipe(event: PointerEvent, id: string) {
  if (event.pointerType === 'mouse') return
  touch = { id, x: event.clientX, y: event.clientY, horizontal: false }
}

function moveSwipe(event: PointerEvent) {
  if (!touch) return

  const dx = event.clientX - touch.x,
    dy = event.clientY - touch.y

  if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.4) {
    touch.horizontal = true
    ignoreTapUntil = Date.now() + 450
    if (dx < -36) swipeId.value = touch.id
    if (dx > 36) swipeId.value = ''
  }
}

function endSwipe() {
  if (touch?.horizontal) ignoreTapUntil = Date.now() + 450
  touch = undefined
}

function rename(item: Conversation, event: Event) {
  if (consumeTap(event)) return
  editing.value = item
  name.value = item.title
  mutationError.value = ''
}

function remove(item: Conversation) {
  removing.value = item
  mutationError.value = ''
}

function close() {
  if (busy.value) return
  editing.value = null
  removing.value = null
  mutationError.value = ''
}

async function saveName() {
  if (!editing.value || busy.value) return

  const input = conversationNameInputSchema.safeParse({ title: name.value })

  if (!input.success) {
    mutationError.value = input.error.issues[0]?.message ?? '请输入对话名称。'
    return
  }
  busy.value = true
  mutationError.value = ''
  try {
    await accountFetch('/api/account/conversations/' + editing.value.id, {
      method: 'PATCH',
      body: input.data,
      retry: 0,
    })
    clearNuxtData('account-conversation-' + props.ownerId + '-' + editing.value.id)
    editing.value = null
    await refresh()
  } catch (failure) {
    mutationError.value = workspaceFeedback(failure, '暂时无法修改名称，请重试。')
  } finally {
    busy.value = false
  }
}

async function confirmDelete() {
  if (!removing.value || busy.value) return
  busy.value = true
  mutationError.value = ''
  try {
    const id = removing.value.id

    await accountFetch('/api/account/conversations/' + id, { method: 'DELETE', retry: 0 })
    clearNuxtData('account-conversation-' + props.ownerId + '-' + id)
    removing.value = null
    swipeId.value = ''
    await refresh()
  } catch (failure) {
    mutationError.value = workspaceFeedback(failure, '暂时无法删除，请重试。')
  } finally {
    busy.value = false
  }
}

await listing.request
</script>

<template>
  <form class="search-field history-search" role="search" @submit.prevent="search">
    <AppIcon name="search" :size="18" />
    <label class="sr-only" for="conversation-search">搜索对话名称</label>
    <input
      id="conversation-search"
      v-model="query"
      type="search"
      maxlength="100"
      placeholder="搜索对话名称"
      @input="scheduleSearch"
    />
    <button
      v-if="query"
      class="icon-button"
      type="button"
      aria-label="清空搜索内容"
      @click="clearSearch"
    >
      <AppIcon name="close" :size="16" />
    </button>
  </form>
  <div v-if="error" class="status-panel section" role="alert">
    <p>对话记录暂时无法读取。</p>
    <button class="text-button" @click="refresh()">重新加载</button>
  </div>
  <p v-else-if="status === 'pending'" class="status-panel" role="status">正在加载会话…</p>
  <div v-else-if="items.length" class="conversation-list">
    <article
      v-for="item in items"
      :key="item.id"
      class="swipe-record"
      :class="{ 'swipe-open': swipeId === item.id }"
      @pointerdown="startSwipe($event, item.id)"
      @pointermove="moveSwipe"
      @pointerup="endSwipe"
      @pointercancel="endSwipe"
    >
      <button
        v-if="swipeId === item.id"
        class="swipe-delete"
        aria-label="删除对话记录"
        @click="remove(item)"
      >
        删除
      </button>
      <div class="card conversation-card">
        <span class="conversation-icon" aria-hidden="true">AI</span>
        <div class="conversation-copy">
          <NuxtLink :to="'/ai/' + item.id" class="conversation-heading" @click="consumeTap">
            <h2>{{ item.latex ? '公式问答' : '自由问答' }}</h2>
            <time :datetime="item.updatedAt ?? item.createdAt">{{ timestamp(item) }}</time>
          </NuxtLink>
          <button class="conversation-name" aria-label="修改对话名称" @click="rename(item, $event)">
            对话名称：{{ item.title }}
            <AppIcon name="pencil" :size="12" />
          </button>
          <NuxtLink :to="'/ai/' + item.id" class="conversation-preview" @click="consumeTap">
            <MathFormula v-if="item.latex" :latex="item.latex" :display="false" />
            <p v-if="item.preview">{{ item.preview }}</p>
            <span v-else class="muted">继续这段对话</span>
          </NuxtLink>
        </div>
        <button class="icon-button desktop-delete" aria-label="删除对话记录" @click="remove(item)">
          <AppIcon name="trash" :size="16" />
        </button>
      </div>
    </article>
  </div>
  <EmptyState
    v-else
    class="conversation-empty"
    hide-icon
    :title="listing.query.value ? '换个关键词试试吧~' : '快来和墨析一起学习吧~'"
    :action-label="listing.query.value ? undefined : '开始学习'"
    :action-to="listing.query.value ? undefined : '/ai'"
  />
  <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
  <button
    v-if="cursor && !error"
    class="button button-secondary button-block section"
    :disabled="loading"
    @click="listing.more"
  >
    {{ loading ? '正在加载…' : '加载更多' }}
  </button>

  <AppModal :open="!!editing" title="设置对话名称" @close="close">
    <form class="stack" @submit.prevent="saveName">
      <label for="conversation-name">对话名称</label>
      <input
        id="conversation-name"
        v-model="name"
        class="name-input"
        maxlength="40"
        autocomplete="off"
        :disabled="busy"
      />
      <p v-if="mutationError" class="error-text" role="alert">{{ mutationError }}</p>
      <div class="row modal-actions">
        <button class="button button-secondary" type="button" :disabled="busy" @click="close">
          取消
        </button>
        <button class="button button-primary" :disabled="busy">
          {{ busy ? '保存中…' : '保存' }}
        </button>
      </div>
    </form>
  </AppModal>
  <AppModal :open="!!removing" title="删除这段会话？" @close="close">
    <p>仅删除对话记录，不会删除对应公式，也不会进入回收站；记录删除后无法恢复。</p>
    <p v-if="mutationError" class="error-text" role="alert">{{ mutationError }}</p>
    <div class="row modal-actions">
      <button class="button button-secondary" :disabled="busy" @click="close">取消</button>
      <button class="button button-primary" :disabled="busy" @click="confirmDelete">
        {{ busy ? '删除中…' : '删除' }}
      </button>
    </div>
  </AppModal>
</template>

<style scoped>
.conversation-empty :deep(h2) {
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.9;
}
.history-search {
  gap: 10px;
  margin: 0 0 20px;
}
.conversation-list {
  display: grid;
  gap: 12px;
}
.swipe-record {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-card);
  touch-action: pan-y;
}
.conversation-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  transition: transform 0.18s ease;
}
.swipe-open .conversation-card {
  transform: translateX(-76px);
}
.swipe-delete {
  position: absolute;
  inset: 0 0 0 auto;
  width: 76px;
  color: white;
  background: var(--color-danger);
  border: 0;
}
.conversation-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: #eee9ff;
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
}
.conversation-copy {
  flex: 1;
  min-width: 0;
}
.conversation-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}
h2 {
  font-size: 14px;
  font-weight: 600;
}
time {
  color: var(--color-muted);
  font-size: 11px;
  white-space: nowrap;
}
.conversation-name {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  border: 0;
  padding: 4px 0;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-align: left;
  overflow-wrap: anywhere;
}
.conversation-name svg {
  flex-shrink: 0;
  color: var(--color-primary);
}
.conversation-preview {
  display: block;
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.conversation-preview p {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color: var(--color-text-secondary);
}
.conversation-preview :deep(.math-inline) {
  margin: 4px 0 8px;
  font-size: 15px;
}
.desktop-delete {
  flex-shrink: 0;
  width: 28px;
  height: 32px;
  color: var(--color-muted);
}
.modal-actions {
  justify-content: flex-end;
  gap: 12px;
  margin-top: 22px;
}
.name-input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px;
  font-size: 16px;
}
@media (hover: none) {
  .desktop-delete {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .desktop-delete:focus-visible {
    position: static;
    width: 32px;
    height: 32px;
    clip-path: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .conversation-card {
    transition: none;
  }
}
</style>
