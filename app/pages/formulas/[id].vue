<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'
definePageMeta({ middleware: 'auth', bottomNav: false, alias: '/account/formulas/:id' })
useHead({ title: '公式详情 · Formula AI' })
const id = String(useRoute().params.id)
const {
  data: formula,
  error,
  refresh,
} = await useFetch<SavedFormula>('/api/account/formulas/' + id, { key: 'saved-formula-' + id })
const current = computed(() => formula.value?.versions.at(-1))
const showEditor = ref(false),
  showVersions = ref(false)
const { showToast } = useToast()
function saved(value: SavedFormula) {
  formula.value = value
  clearNuxtData(
    (key) =>
      key.startsWith('account-library-') ||
      key.startsWith('account-history') ||
      ['account-categories', 'home-recent'].includes(key),
  )
  showToast('公式已保存。')
}
</script>
<template>
  <PageHeader title="公式详情" back-to="/library" />
  <template v-if="formula && current && !error">
    <FormulaDetailContent
      :title="formula.title"
      :latex="current.latex"
      :version="current.number"
      :version-count="formula.versions.length"
      :image-src="formula.image ? '/api/account/files/' + formula.image.id + '/content' : undefined"
      :badge="current.isMock ? '模拟结果' : undefined"
      @edit="showEditor = true"
      @versions="showVersions = true"
    >
      <template #organization>
        <AccountFormulaOrganization :formula="formula" @saved="saved" />
      </template>
      <template #actions>
        <NuxtLink
          :to="'/ai/new?versionId=' + current.id"
          class="button button-primary button-block"
        >
          <AppIcon name="sparkles" :size="19" />
          AI 解析
        </NuxtLink>
        <AccountExport :formula="formula" />
      </template>
      <template #note>识别后请核对公式。每次修改独立保存，原始结果始终保留。</template>
    </FormulaDetailContent>
    <AccountFormulaEditor
      :open="showEditor"
      :formula="formula"
      @close="showEditor = false"
      @saved="saved"
    />
    <AppModal :open="showVersions" title="版本记录" sheet @close="showVersions = false">
      <div class="stack">
        <details
          v-for="version in formula.versions.toReversed()"
          :key="version.id"
          class="version-row"
        >
          <summary>
            v{{ version.number }} · {{ version.number === 1 ? '原始识别' : '人工修订' }}
            <span class="muted">{{ version.number === current.number ? '当前版本' : '展开' }}</span>
          </summary>
          <MathFormula :latex="version.latex" />
          <NuxtLink :to="'/ai/new?versionId=' + version.id" class="text-button">
            讨论这个版本
          </NuxtLink>
        </details>
      </div>
    </AppModal>
  </template>
  <div v-else class="status-panel card" role="alert">
    <h2>暂时无法打开这条公式</h2>
    <p>记录可能不存在、无权限或暂时无法连接。</p>
    <button class="text-button" @click="refresh()">重新加载</button>
    <NuxtLink to="/library" class="text-button">返回公式库</NuxtLink>
  </div>
</template>
<style scoped>
.version-row {
  padding: 16px;
  background: #f6f3fc;
  border-radius: 14px;
}
summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  cursor: pointer;
  line-height: 1.8;
}
</style>
