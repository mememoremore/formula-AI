<script setup lang="ts">
const route = useRoute(),
  router = useRouter()
const listing = useConversationListing()
const { items, cursor, loading, feedback } = listing
const { error, status, refresh } = listing.request
const query = ref(listing.query.value)
watch(listing.query, (value) => {
  query.value = value
})
const groups = computed(() => {
  const result = new Map<string, typeof items.value>()
  for (const item of items.value) {
    const date = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(item.createdAt))
    if (!result.has(date)) result.set(date, [])
    result.get(date)!.push(item)
  }
  return [...result].map(([date, entries]) => ({ date, entries }))
})
async function search() {
  await router.replace({ query: { ...route.query, q: query.value.trim() || undefined } })
}
await listing.request
</script>
<template>
  <NuxtLink to="/ai/new" class="button button-primary button-block">
    <AppIcon name="plus" :size="18" />
    新对话
  </NuxtLink>
  <form class="search-field section" role="search" @submit.prevent="search">
    <label class="sr-only" for="conversation-search">搜索对话标题或提问</label>
    <input
      id="conversation-search"
      v-model="query"
      type="search"
      maxlength="100"
      placeholder="搜索对话标题或提问"
    />
    <button class="icon-button" type="submit" aria-label="搜索对话">
      <AppIcon name="search" :size="19" />
    </button>
  </form>
  <div v-if="error" class="status-panel section" role="alert">
    <p>对话记录暂时无法读取。</p>
    <button class="text-button" @click="refresh()">重新加载</button>
  </div>
  <p v-else-if="status === 'pending'" class="status-panel" role="status">正在查找对话…</p>
  <template v-else-if="items.length">
    <section v-for="group in groups" :key="group.date" class="section">
      <h2 class="date-heading">{{ group.date }}</h2>
      <div class="stack">
        <NuxtLink
          v-for="item in group.entries"
          :key="item.id"
          :to="'/ai/' + item.id"
          class="card conversation-item"
        >
          <span class="soft-icon">
            <AppIcon :name="item.latex ? 'book' : 'message'" :size="20" />
          </span>
          <div>
            <h3>{{ item.title }}</h3>
            <MathFormula v-if="item.latex" :latex="item.latex" :display="false" />
            <p v-else>{{ item.preview || '打开并继续这段思考' }}</p>
          </div>
          <AppIcon name="chevron" :size="16" />
        </NuxtLink>
      </div>
    </section>
  </template>
  <EmptyState
    v-else
    :title="listing.query.value ? '没有找到匹配的对话' : '开始第一段思考'"
    :description="
      listing.query.value
        ? '换一个关键词试试，也可以搜索你曾经提问的内容。'
        : '直接提问，或从公式详情带入你想讨论的公式。'
    "
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
</template>
<style scoped>
.date-heading {
  margin-bottom: 14px;
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 500;
}
.conversation-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 21px 18px;
}
.conversation-item > div {
  flex: 1;
  min-width: 0;
}
h3 {
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
p {
  font-size: 12px;
  color: var(--color-muted);
  margin-top: 7px;
  line-height: 1.7;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.conversation-item :deep(.math-inline) {
  margin-top: 8px;
  color: #858099;
  font-size: 11px;
}
.search-field {
  padding-right: 5px;
}
</style>
