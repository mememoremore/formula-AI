<script setup lang="ts">
import type { RecommendationView } from '#shared/recommendations'
import { workspaceFeedback } from '~/utils/workspace-feedback'
import { usageInvalidated } from '~/utils/account-cache'

const props = defineProps<{ ownerId: string }>()
const fetcher = useAccountFetch(),
  busy = ref(false),
  feedback = ref('')
let disposed = false,
  controller: AbortController | undefined
const request = useTaskPolling<RecommendationView>(
  'personalized-recommendations-' + props.ownerId,
  '/api/account/recommendations',
  (value) => value.status === 'PROCESSING',
  {
    paused: busy,
    getCachedData: () => undefined,
    read: (signal) =>
      fetcher<RecommendationView>('/api/account/recommendations', {
        headers: { 'x-account-id': props.ownerId },
        retry: 0,
        signal,
      }),
  },
)
const value = request.data
const selectedId = ref('')
const items = computed(() => value.value?.items.filter((item) => !!item.kind) ?? [])
const current = computed(
  () => items.value.find((item) => item.id === selectedId.value) ?? items.value[0],
)
const canChange = computed(
  () =>
    !busy.value &&
    value.value?.status !== 'PROCESSING' &&
    (items.value.length > 1 ||
      (!!value.value?.canGenerate && ['PREVIEW', 'FAILED'].includes(value.value.status))),
)

watch(
  () => [value.value?.fingerprint, items.value.map((item) => item.id).join(',')].join(':'),
  () => {
    selectedId.value = items.value[0]?.id ?? ''
  },
)

function changeRecommendation() {
  if (!canChange.value || !value.value) return
  if (!items.value.length) {
    void generate()
    return
  }
  if (!current.value) return

  const index = items.value.findIndex((item) => item.id === current.value!.id)

  selectedId.value = items.value[(index + 1) % items.value.length]!.id
}

onScopeDispose(() => {
  disposed = true
  controller?.abort()
})

async function generate() {
  if (
    !value.value ||
    busy.value ||
    value.value.status === 'PROCESSING' ||
    value.value.status === 'READY'
  )
    return
  busy.value = true
  feedback.value = ''
  controller = new AbortController()
  try {
    const result = await fetcher<RecommendationView>('/api/account/recommendations', {
      method: 'POST',
      body: { fingerprint: value.value.fingerprint, retry: value.value.status === 'FAILED' },
      headers: { 'x-account-id': props.ownerId },
      retry: 0,
      timeout: 85000,
      signal: controller.signal,
    })

    if (!disposed) request.data.value = result
  } catch (error) {
    if (!disposed) {
      feedback.value = workspaceFeedback(
        error,
        '推荐结果尚未确认，请稍后重新读取；请点击换一个重试。',
      )
      await request.refresh()
    }
  } finally {
    if (!disposed) {
      busy.value = false
      clearNuxtData(usageInvalidated)
    }
  }
}
</script>
<template>
  <section class="recommendations section" aria-label="个性化公式推荐">
    <div class="section-heading recommendations-heading">
      <h2>为你推荐</h2>
      <button
        type="button"
        class="text-button change-recommendation"
        :disabled="!canChange"
        :title="items.length ? '切换已生成的新公式' : '点击生成新公式，每次新生成使用1次AI额度'"
        aria-label="换一个推荐公式"
        @click="changeRecommendation"
      >
        <AppIcon name="rotate" :size="14" />
        换一个
      </button>
    </div>
    <article class="card recommendation-card" aria-live="polite">
      <template v-if="current">
        <GeneratedRecommendationCard
          v-if="current.kind"
          :key="current.id"
          :item="current"
          :owner-id="ownerId"
        />
      </template>
      <div v-else-if="request.error.value" class="recommendation-status" role="alert">
        <p>推荐暂时无法读取</p>
        <button class="text-button" @click="request.refresh()">重新读取推荐</button>
      </div>
      <EmptyState
        v-else-if="value && !busy && value.status !== 'PROCESSING'"
        title="暂无推荐公式"
        :action-label="value.status === 'EMPTY' ? '去识别' : undefined"
        :action-to="value.status === 'EMPTY' ? '/upload' : undefined"
      />
      <p v-else class="recommendation-status" role="status">
        {{ busy || value?.status === 'PROCESSING' ? '正在生成新公式…' : '正在读取推荐…' }}
      </p>
      <p v-if="feedback || value?.warning" class="recommendation-feedback" role="status">
        {{ feedback || value?.warning }}
      </p>
    </article>
  </section>
</template>
<style scoped>
.recommendations {
  margin-top: 24px;
  min-width: 0;
}
.recommendations-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
h2 {
  font-size: 16px;
}
.change-recommendation {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
}
.change-recommendation:disabled {
  opacity: 0.45;
}
.recommendation-card {
  min-width: 0;
  overflow: hidden;
}
.recommendation-status {
  display: grid;
  place-items: center;
  gap: 14px;
  padding: 46px 18px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary);
}
.recommendation-feedback {
  margin: 0;
  padding: 0 20px 16px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--color-text-secondary);
}
</style>
