<script setup lang="ts">
import { displayFormulaTitle } from '#shared/formula-title'
import type { FormulaLearningView } from '#shared/schemas/learning'
import { workspaceFeedback } from '~/utils/workspace-feedback'

definePageMeta({ middleware: 'auth', contentWidth: 'reading' })
useHead({ title: '公式复习 · 墨析' })

const session = await useAccountSession(),
  owner = session.data.value?.user?.id,
  fetcher = useAccountFetch()

interface Card {
  id: string
  title: string
  category: string
  latex: string
  imageId: string | null
  learning: FormulaLearningView
}

const all = ref(false),
  index = ref(0),
  revealed = ref(false),
  imageFailed = ref(false),
  busy = ref(false),
  feedback = ref('')
const request = await useAsyncData('review:' + owner, async () => {
  const data = await fetcher<{ items: Card[] }>('/api/account/review', {
    query: { all: String(all.value) },
    headers: { 'x-account-id': owner ?? '' },
    retry: 0,
  })

  if (session.data.value?.user?.id !== owner) throw new Error('账号已变化，请刷新页面。')
  return data
})
const card = computed(() => request.data.value?.items[index.value])

watch(
  () => card.value?.id,
  () => {
    imageFailed.value = false
  },
)

async function load() {
  index.value = 0
  revealed.value = false
  await request.refresh()
}

async function rate(rating: 'again' | 'hard' | 'known') {
  if (!card.value || busy.value) return
  busy.value = true
  feedback.value = ''
  try {
    await fetcher('/api/account/formulas/' + card.value.id + '/review', {
      method: 'POST',
      headers: { 'x-account-id': owner ?? '' },
      body: { revision: card.value.learning.revision, rating },
      retry: 0,
    })
    index.value++
    revealed.value = false
  } catch (error) {
    feedback.value = workspaceFeedback(error, '复习记录未确认，请重新读取卡片，避免重复计数。')
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <PageHeader title="公式复习" back-to="/profile" />
  <label class="row">
    <input
      v-model="all"
      type="checkbox"
      :disabled="busy || request.status.value === 'pending'"
      @change="load"
    />
    包含尚未到期的卡片
  </label>
  <p v-if="request.error.value" class="error-text">
    卡片读取失败，请重试。
    <button class="text-button" :disabled="busy" @click="load">重试</button>
  </p>
  <section v-if="card" class="card review-card section">
    <p class="info-note">
      {{ index + 1 }} / {{ request.data.value?.items.length }} · {{ card.category }}
    </p>
    <h2>{{ displayFormulaTitle(card.title) }}</h2>
    <div class="review-formula paper-preview" aria-label="待复习公式">
      <img
        v-if="card.imageId && !imageFailed"
        :src="'/api/account/files/' + card.imageId + '/content'"
        alt="待复习的公式原图"
        @error="imageFailed = true"
      />
      <MathFormula v-else :latex="card.latex" />
    </div>
    <p class="info-note review-instruction">回忆适用条件并回答以下问题，思考完再查看答案</p>
    <ol v-if="card.learning.questions.length" class="review-questions">
      <li v-for="question in card.learning.questions" :key="question.id">
        {{ question.question }}
      </li>
    </ol>
    <p v-else class="info-note">尚未添加复习问题，可在公式详情中补充。</p>
    <template v-if="revealed">
      <article
        v-for="(question, position) in card.learning.questions"
        :key="question.id"
        class="review-answer"
      >
        <strong>问题{{ position + 1 }}：{{ question.question }}</strong>
        <p class="note">答案：{{ question.answer || '这道题尚未填写答案。' }}</p>
      </article>
      <section class="review-conditions">
        <h3>适用条件</h3>
        <p class="note">{{ card.learning.conditions || '暂未填写适用条件。' }}</p>
      </section>
      <template v-if="card.learning.notes">
        <h3>学习笔记</h3>
        <p class="note">{{ card.learning.notes }}</p>
      </template>
      <div class="row">
        <button
          class="button button-secondary"
          :disabled="busy || request.status.value === 'pending'"
          @click="rate('again')"
        >
          不会 · 10分钟后
        </button>
        <button
          class="button button-secondary"
          :disabled="busy || request.status.value === 'pending'"
          @click="rate('hard')"
        >
          模糊 · 明天
        </button>
        <button
          class="button button-primary"
          :disabled="busy || request.status.value === 'pending'"
          @click="rate('known')"
        >
          会了 · 延后复习
        </button>
      </div>
    </template>
    <button
      v-else
      class="button button-primary button-block section"
      :disabled="request.status.value === 'pending'"
      @click="revealed = true"
    >
      查看答案
    </button>
    <NuxtLink v-if="revealed" :to="'/formulas/' + card.id" class="text-button section">
      查看公式详情
    </NuxtLink>
  </section>
  <EmptyState
    v-else-if="request.data.value"
    title="本轮复习完成"
    description="可以稍后回来复习，或在公式详情中添加更多卡片。"
  />
  <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
</template>
<style scoped>
.review-card {
  padding: 20px;
}
h2 {
  font-size: 18px;
  margin: 16px 0;
}
h3 {
  font-size: 15px;
}
.review-formula {
  display: grid;
  place-items: center;
  min-height: 120px;
  padding: 16px;
  min-width: 0;
}
.review-formula img {
  display: block;
  max-width: 100%;
  max-height: 320px;
  object-fit: contain;
}
.review-instruction {
  margin: 16px 0;
}
.review-conditions {
  margin: 18px 0;
}
.note {
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.8;
  margin: 12px 0;
}
.row {
  flex-wrap: wrap;
}
.review-questions {
  padding-left: 22px;
  font-size: 14px;
  line-height: 1.8;
}
.review-answer {
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
  margin-top: 14px;
  font-size: 14px;
}
</style>
