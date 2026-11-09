<script setup lang="ts">
import { recommendationKinds, type GeneratedRecommendation } from '#shared/recommendations'
import type { SavedFormula } from '#shared/types/workspace'
import { useAccountMutation, isAccountWriteCancelled } from '~/composables/useAccountMutation'
import { workspaceFeedback } from '~/utils/workspace-feedback'

const props = defineProps<{ item: GeneratedRecommendation; ownerId: string }>()
const fetcher = useAccountFetch(),
  invalidate = useFormulaViewsInvalidation()
const feedback = ref(''),
  savedId = ref('')
const mutation = useAccountMutation(
  'create',
  async (item: GeneratedRecommendation, { owner, signal }) =>
    fetcher<SavedFormula>('/api/account/formulas', {
      method: 'POST',
      headers: { 'x-account-id': owner },
      signal,
      retry: 0,
      timeout: 20000,
      body: { title: item.title, latex: item.latex, requestKey: item.id },
    }),
  (result, _item, owner) => {
    savedId.value = result.id
    void invalidate(owner)
  },
  toRef(props, 'ownerId'),
)
const { busy } = mutation

async function save() {
  if (busy.value || savedId.value) return
  feedback.value = ''
  try {
    await mutation.execute(props.item)
  } catch (error) {
    if (!isAccountWriteCancelled(error))
      feedback.value = workspaceFeedback(
        error,
        '保存结果尚未确认，请点击原按钮重试，不会重复创建同一推荐。',
      )
  }
}
</script>
<template>
  <div class="generated-recommendation">
    <div class="generated-heading">
      <span>{{ recommendationKinds[item.kind] }}</span>
      <span>AI生成 · 待核对</span>
    </div>
    <h3>{{ item.title }}</h3>
    <MathFormula :latex="item.latex" />
    <p class="generated-reason">{{ item.reason }}</p>
    <details class="recommendation-evidence">
      <summary>
        查看来源与{{
          item.kind === 'DERIVATION' || item.kind === 'SIMPLIFICATION' ? '推导步骤' : '关联说明'
        }}
      </summary>
      <h4>来源公式</h4>
      <NuxtLink
        v-for="source in item.sources"
        :key="source.id"
        :to="'/formulas/' + source.id"
        class="source-formula"
      >
        <span>{{ source.title }}</span>
        <MathFormula :latex="source.latex" />
      </NuxtLink>
      <h4>
        {{ item.kind === 'DERIVATION' || item.kind === 'SIMPLIFICATION' ? '推导步骤' : '关联说明' }}
      </h4>
      <ol>
        <li v-for="(step, index) in item.steps" :key="index">
          <MathFormula :latex="step.latex" />
          <p>{{ step.explanation }}</p>
        </li>
      </ol>
    </details>
    <div class="generated-conditions">
      <h4>适用条件</h4>
      <p>{{ item.conditions }}</p>
    </div>
    <p class="verification-note">请对照来源、条件和步骤核对，AI生成内容可能有误。</p>
    <NuxtLink v-if="savedId" :to="'/formulas/' + savedId" class="text-button">
      已添加，查看公式
    </NuxtLink>
    <button v-else type="button" class="button button-secondary" :disabled="busy" @click="save">
      {{ busy ? '正在添加…' : '添加到公式库' }}
    </button>
    <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
  </div>
</template>
<style scoped>
.generated-recommendation {
  padding: 20px;
  min-width: 0;
}
.generated-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
  margin-bottom: 12px;
}
h3 {
  font-size: 15px;
  margin: 0 0 12px;
  overflow-wrap: anywhere;
}
h4 {
  font-size: 13px;
  margin: 14px 0 6px;
}
p,
summary,
.source-formula {
  font-size: 13px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
p {
  margin: 6px 0;
  color: var(--color-text-secondary);
}
summary {
  cursor: pointer;
  color: var(--color-primary);
}
.recommendation-evidence {
  margin-top: 12px;
}
.source-formula {
  display: block;
  padding: 8px 12px;
  margin-top: 8px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
}
ol {
  padding-left: 20px;
}
.verification-note {
  font-size: 12px;
  margin: 14px 0;
}
</style>
