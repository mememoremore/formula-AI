<script setup lang="ts">
import type { SavedFormula } from '#shared/types/workspace'
definePageMeta({
  middleware: 'auth',
  bottomNav: false,
  contentWidth: 'reading',
  alias: '/account/formulas/:id',
})
useHead({ title: '公式详情 · Formula AI' })
const route = useRoute()
const id = computed(() => String(route.params.id))
const session = useAccountSession()
await session
const ownerId = computed(() =>
  session.status.value === 'success' ? session.data.value?.user?.id : undefined,
)
const { request, formula, update } = useAccountFormula(id, ownerId)
await request
const current = computed(() => formula.value?.versions.at(-1))
const showEditor = ref(false),
  showVersions = ref(false)
const identity = computed(() => id.value + ':' + (ownerId.value ?? 'unconfirmed'))
watch(identity, () => {
  showEditor.value = false
  showVersions.value = false
})
const { showToast } = useToast()
function saved(value: SavedFormula) {
  update(value)
  showToast('公式已保存。')
}
const versions = computed(() =>
  (formula.value?.versions ?? []).map((version) => ({
    ...version,
    label:
      version.origin === 'RECOGNITION'
        ? '原始识别'
        : version.origin === 'DEMO'
          ? '模拟示例'
          : '人工修订',
    to: '/ai/new?versionId=' + encodeURIComponent(version.id),
  })),
)
const errorCode = computed(
  () => (request.error.value as { statusCode?: number } | null)?.statusCode,
)
</script>
<template>
  <PageHeader title="公式详情" back-to="/library?space=account" />
  <div
    v-if="session.status.value === 'pending' || request.status.value === 'pending'"
    class="card status-panel"
    role="status"
  >
    正在读取公式…
  </div>
  <div v-else-if="session.error.value" class="card status-panel" role="alert">
    <h2>暂时无法确认账号</h2>
    <p>已隐藏私有公式，请重新连接。</p>
    <button class="text-button" @click="session.refresh()">重新连接账号</button>
  </div>
  <div v-else-if="!ownerId" class="card status-panel" role="alert">
    <h2>请登录后查看</h2>
    <p>账号公式不会转为本机演示结果。</p>
    <NuxtLink
      :to="{ path: '/login', query: { redirect: route.fullPath } }"
      class="button button-primary"
    >
      前往登录
    </NuxtLink>
  </div>
  <template v-else-if="formula && current && !request.error.value">
    <FormulaDetailContent
      :key="identity"
      :title="formula.title"
      :latex="current.latex"
      :version="current.number"
      :version-count="formula.versions.length"
      :image-src="formula.image ? '/api/account/files/' + formula.image.id + '/content' : undefined"
      :badge="current.isMock ? '模拟结果' : '账号公式'"
      @edit="showEditor = true"
      @versions="showVersions = true"
    >
      <template #organization>
        <AccountFormulaOrganization :formula="formula" @saved="update" />
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
      <template #note>
        识别后请核对公式。每次内容修改独立保存，AI 讨论与导出均绑定所选版本。
      </template>
    </FormulaDetailContent>
    <AccountFormulaEditor
      :key="identity + ':editor'"
      :open="showEditor"
      :formula="formula"
      @close="showEditor = false"
      @saved="saved"
    />
    <FormulaVersions :open="showVersions" :versions="versions" @close="showVersions = false" />
  </template>
  <div v-else class="status-panel card" role="alert">
    <h2>{{ errorCode === 404 ? '未找到这条公式' : '暂时无法打开这条公式' }}</h2>
    <p>
      {{
        errorCode === 404
          ? '记录不存在，或当前账号无权访问。'
          : errorCode === 401
            ? '登录已过期，请重新登录。'
            : '连接暂时失败，请重试。不会影响已保存的内容。'
      }}
    </p>
    <button v-if="errorCode !== 404" class="text-button" @click="request.refresh()">
      重新加载
    </button>
    <NuxtLink to="/library?space=account" class="text-button">返回公式库</NuxtLink>
  </div>
</template>
