<script setup lang="ts">
import type {
  FormulaLearningView,
  LearningQuestion,
  LearningGenerationView,
} from '#shared/schemas/learning'
import { workspaceFeedback } from '~/utils/workspace-feedback'
import { usageInvalidated } from '~/utils/account-cache'

const props = defineProps<{ formulaId: string; ownerId: string }>()
const fetcher = useAccountFetch(),
  toast = useToast(),
  invalidate = useFormulaViewsInvalidation()
const request = await useAsyncData('learning:' + props.ownerId + ':' + props.formulaId, () =>
  fetcher<FormulaLearningView>('/api/account/formulas/' + props.formulaId + '/learning', {
    headers: { 'x-account-id': props.ownerId },
    retry: 0,
  }),
)
const notes = ref(''),
  conditions = ref(''),
  baseConditions = ref(''),
  customized = ref(false),
  questions = ref<LearningQuestion[]>([]),
  mastery = ref<'UNFAMILIAR' | 'MASTERED'>('UNFAMILIAR'),
  masteryNotes = ref(''),
  reviewEnabled = ref(false),
  revision = ref(0),
  busy = ref(false),
  feedback = ref(''),
  generating = ref(false),
  generationError = ref('')
let disposed = false,
  controller: AbortController | undefined,
  waitTimer: ReturnType<typeof setTimeout> | undefined,
  wake: (() => void) | undefined

function fill(value: FormulaLearningView | null | undefined) {
  if (!value) return
  notes.value = value.notes
  conditions.value = baseConditions.value = value.conditions
  customized.value = value.conditionsCustomized
  questions.value = value.questions.map((row) => ({ ...row }))
  mastery.value = value.mastery
  masteryNotes.value = value.masteryNotes
  reviewEnabled.value = value.reviewEnabled
  revision.value = value.revision
}

fill(request.data.value)

function addQuestion() {
  if (busy.value || questions.value.length >= 20) return
  questions.value.push({ id: crypto.randomUUID(), question: '', answer: '', source: 'manual' })
}

async function generateQuestions(retry = false) {
  if (generating.value || disposed) return
  generating.value = true
  generationError.value = ''
  controller = new AbortController()

  const signal = controller.signal,
    deadline = Date.now() + 95000

  try {
    while (!disposed && Date.now() < deadline) {
      const result = await fetcher<LearningGenerationView>(
        '/api/account/formulas/' + props.formulaId + '/learning-questions',
        {
          method: 'POST',
          body: { retry },
          headers: { 'x-account-id': props.ownerId },
          signal,
          retry: 0,
          timeout: 75000,
        },
      )

      retry = false
      if (disposed) return
      if (result.status === 'READY') {
        questions.value = [
          ...result.questions,
          ...questions.value.filter((row) => row.source !== 'ai'),
        ].slice(0, 20)
        return
      }
      if (result.status === 'FAILED') {
        generationError.value = result.error || 'AI问答未生成，可重试或手动添加问题。'
        return
      }
      await new Promise<void>((resolve) => {
        wake = resolve
        waitTimer = setTimeout(resolve, 1500)
      })
    }
    if (!disposed) generationError.value = '生成尚未确认，请稍后重试；已提交的请求会继续处理。'
  } catch (error) {
    if (!disposed)
      generationError.value = workspaceFeedback(error, 'AI问答暂时无法生成，可重试或手动添加问题。')
  } finally {
    if (!disposed) {
      generating.value = false
      clearNuxtData(usageInvalidated)
    }
  }
}

onScopeDispose(() => {
  disposed = true
  controller?.abort()
  clearTimeout(waitTimer)
  wake?.()
})

async function save() {
  if (busy.value || generating.value) return false
  busy.value = true
  feedback.value = ''
  try {
    const result = await fetcher<FormulaLearningView>(
      '/api/account/formulas/' + props.formulaId + '/learning',
      {
        method: 'PUT',
        headers: { 'x-account-id': props.ownerId },
        retry: 0,
        body: {
          revision: revision.value,
          notes: notes.value,
          conditions: conditions.value,
          conditionsCustomized: customized.value || conditions.value !== baseConditions.value,
          questions: questions.value.filter((row) => row.question.trim() || row.answer.trim()),
          mastery: mastery.value,
          masteryNotes: masteryNotes.value,
          reviewEnabled: reviewEnabled.value,
        },
      },
    )

    if (disposed) return false
    fill(result)
    request.data.value = result
    toast.showToast('学习笔记已保存')
    clearNuxtData('review:' + props.ownerId)
    await invalidate(props.ownerId)
    return true
  } catch (error) {
    if (!disposed)
      feedback.value = workspaceFeedback(
        error,
        '学习笔记保存失败，请核对内容后重试；如存在版本冲突，请刷新页面。',
      )
    return false
  } finally {
    if (!disposed) busy.value = false
  }
}
</script>
<template>
  <section class="card learning-panel section">
    <h2>我的学习笔记</h2>
    <p v-if="request.error.value" class="error-text">暂时无法读取笔记，请刷新页面后重试。</p>
    <fieldset class="stack learning-fields" :disabled="busy">
      <label>
        适用条件
        <textarea
          v-model="conditions"
          class="input"
          maxlength="2000"
          aria-label="公式适用条件"
          placeholder="优先使用已有AI解释的适用条件，可自行增删"
        />
      </label>
      <label>
        个人笔记
        <textarea v-model="notes" class="input" maxlength="6000" aria-label="公式个人笔记" />
      </label>
      <label>
        熟练度
        <select v-model="mastery" class="input" aria-label="公式熟练度">
          <option value="UNFAMILIAR">不熟悉</option>
          <option value="MASTERED">已掌握</option>
        </select>
      </label>
      <label v-if="mastery === 'UNFAMILIAR'">
        备注
        <textarea
          v-model="masteryNotes"
          class="input"
          maxlength="2000"
          aria-label="熟练度备注"
          placeholder="选填，记录暂不熟悉的地方"
        />
      </label>
      <section class="questions-section" aria-label="复习问题">
        <div class="questions-heading">
          <h3>复习问题</h3>
          <div class="questions-actions">
            <button
              type="button"
              class="text-button"
              :disabled="generating || !!request.error.value"
              @click="generateQuestions(!!generationError)"
            >
              <AppIcon name="sparkles" :size="15" />
              AI提问
            </button>
            <button
              type="button"
              class="text-button"
              :disabled="questions.length >= 20"
              @click="addQuestion"
            >
              <AppIcon name="plus" :size="15" />
              添加问题
            </button>
          </div>
        </div>
        <p class="info-note">
          点击“AI提问”结合年级和学习目的生成3组问答，每次新生成使用1次AI额度；已有结果会复用，手动添加问题不消耗额度。
        </p>
        <p v-if="generating" class="info-note" role="status">正在生成3组个性化问答…</p>
        <p v-if="generationError" class="error-text" role="alert">{{ generationError }}</p>
        <article v-for="(row, index) in questions" :key="row.id" class="question-card">
          <header>
            <span>第{{ index + 1 }}组{{ row.source === 'ai' ? ' · AI' : '' }}</span>
            <button
              type="button"
              class="text-button"
              :aria-label="'移除问题' + (index + 1)"
              @click="questions = questions.filter((item) => item.id !== row.id)"
            >
              <AppIcon name="close" :size="16" />
            </button>
          </header>
          <label class="qa-line">
            <span>问题：</span>
            <textarea
              v-model="row.question"
              class="input"
              rows="2"
              maxlength="600"
              :aria-label="'问题' + (index + 1)"
              placeholder="请输入问题"
            />
          </label>
          <label class="qa-line">
            <span>答案：</span>
            <textarea
              v-model="row.answer"
              class="input"
              rows="2"
              maxlength="2000"
              :aria-label="'答案' + (index + 1)"
              placeholder="请输入答案"
            />
          </label>
        </article>
      </section>
      <label class="review-toggle">
        <input v-model="reviewEnabled" type="checkbox" />
        加入复习卡片
      </label>
      <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
      <div class="learning-actions">
        <button
          class="button button-secondary"
          :disabled="busy || generating || !!request.error.value"
          @click="save"
        >
          {{ busy ? '正在保存…' : '保存学习笔记' }}
        </button>
        <StudySheetExport :ids="[formulaId]" :disabled="busy || generating" :prepare="save" />
      </div>
    </fieldset>
  </section>
</template>
<style scoped>
.learning-panel {
  padding: 18px;
}
.learning-fields {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
h2 {
  font-size: 16px;
  margin-bottom: 14px;
}
h3 {
  font-size: 14px;
}
label {
  font-size: 13px;
  color: var(--color-text-secondary);
}
.input {
  display: block;
  margin-top: 8px;
}
textarea {
  min-height: 90px;
  resize: vertical;
}
.questions-heading,
.question-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.questions-heading {
  flex-wrap: wrap;
}
.questions-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}
.question-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  margin-top: 12px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
}
.question-card header {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.qa-line {
  display: grid;
  grid-template-columns: 3em minmax(0, 1fr);
  align-items: start;
  gap: 6px;
}
.qa-line > span {
  line-height: 40px;
}
.qa-line textarea {
  margin-top: 0;
  min-height: 68px;
}
.learning-actions {
  display: flex;
  gap: 10px;
}
.learning-actions > :deep(.button) {
  flex: 1 1 0;
  min-width: 0;
  padding-inline: 6px;
  font-size: 13px;
}
.review-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
