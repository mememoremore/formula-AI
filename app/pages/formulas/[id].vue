<script setup lang="ts">
import { displayFormulaTitle, isRandomFormulaName } from '#shared/formula-title'
import type { SavedFormula } from '#shared/types/workspace'

definePageMeta({
  middleware: 'auth',
  bottomNav: false,
  contentWidth: 'reading',
  alias: '/account/formulas/:id',
})
useHead({ title: '公式详情 · 墨析' })

const route = useRoute()
const id = computed(() => String(route.params.id))
const session = useAccountSession()
const deletion = useFormulaDeleteMutation()

await session

const ownerId = computed(() =>
  session.status.value === 'success' ? session.data.value?.user?.id : undefined,
)
const { request, formula, update } = useAccountFormula(id, ownerId)

await request

const manual = computed(() => formula.value?.versions[0]?.origin === 'MANUAL')
const current = computed(() => formula.value?.versions.at(-1))
const showEditor = ref(false),
  showDelete = ref(false),
  deleting = deletion.busy,
  deleteError = ref('')
const identity = computed(() => id.value + ':' + (ownerId.value ?? 'unconfirmed'))
const intelligence = ref<{ openRepair: () => void }>()

watch(identity, () => {
  showEditor.value = false
  showDelete.value = false
})

const { showToast } = useToast()

function saved(value: SavedFormula) {
  update(value)
  showToast('公式已保存。')
}

async function removeFormula() {
  if (deleting.value || !ownerId.value) return
  deleteError.value = ''
  try {
    await deletion.execute(id.value)
    showToast('公式已删除。')
    await navigateTo('/library?space=account')
  } catch (error) {
    if (isAccountWriteCancelled(error)) return
    deleteError.value = workspaceFeedback(error, '删除失败，请稍后重试。')
  }
}

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
      :title="displayFormulaTitle(formula.title, formula.versions[0]?.origin === 'RECOGNITION')"
      :needs-name="
        formula.versions[0]?.origin === 'RECOGNITION' &&
        (isRandomFormulaName(formula.title) || formula.title === '未命名公式')
      "
      :latex="current.latex"
      :image-src="formula.image ? '/api/account/files/' + formula.image.id + '/content' : undefined"
      :badge="manual ? '手动输入' : current.isMock ? '模拟结果' : undefined"
      :manual="manual"
      deletable
      :original-latex="manual ? current.latex : undefined"
      @edit="showEditor = true"
      @remove="showDelete = true"
    >
      <template #title-actions>
        <AccountFormulaOrganization :formula="formula" placement="favorite" @saved="update" />
      </template>
      <template #primary>
        <AccountFormulaIntelligence
          ref="intelligence"
          :key="identity + ':intelligence'"
          :formula="formula"
          :owner-id="ownerId"
          @saved="update"
        />
        <AccountFormulaExplanations
          :key="identity + ':explanations:' + (formula.identityId ?? formula.id)"
          :formula="formula"
          :owner-id="ownerId"
        />
      </template>
      <template #reading-actions>
        <button class="text-button" @click="intelligence?.openRepair()">
          <AppIcon name="rotate" :size="16" />
          重新生成
        </button>
      </template>
      <template #actions>
        <AccountExport :formula="formula" />
      </template>
      <template #footer>
        <FormulaLearningPanel
          :key="formula.id + ':' + (formula.identityId ?? formula.id) + ':' + current.id"
          :formula-id="formula.id"
          :owner-id="ownerId"
        />
        <AccountFormulaOrganization :formula="formula" @saved="update" />
      </template>
    </FormulaDetailContent>
    <AccountFormulaEditor
      :key="identity + ':editor'"
      :open="showEditor"
      :formula="formula"
      @close="showEditor = false"
      @saved="saved"
      @reloaded="update"
    />
    <AppModal :open="showDelete" title="删除公式" @close="!deleting && (showDelete = false)">
      <div class="stack">
        <p>
          删除后，这条公式将从公式库中隐藏；已有对话和导出记录会保留，可在“我的—回收站”恢复公式。
        </p>
        <p v-if="deleteError" class="error-text" role="alert">{{ deleteError }}</p>
        <div class="delete-actions">
          <button class="button button-white" :disabled="deleting" @click="showDelete = false">
            取消
          </button>
          <button class="button delete-button" :disabled="deleting" @click="removeFormula">
            {{ deleting ? '正在删除…' : '确认删除' }}
          </button>
        </div>
      </div>
    </AppModal>
  </template>
  <div v-else class="status-panel card" role="alert">
    <h2>{{ errorCode === 404 ? '未找到这条公式' : '暂时无法打开这条公式' }}</h2>
    <p>
      {{
        errorCode === 404
          ? '记录不存在，或当前账号无权访问；'
          : errorCode === 401
            ? '登录已过期，请重新登录；'
            : '连接暂时失败，请重试；不会影响已保存的内容。'
      }}
    </p>
    <button v-if="errorCode !== 404" class="text-button" @click="request.refresh()">
      重新加载
    </button>
    <NuxtLink to="/library?space=account" class="text-button">返回公式库</NuxtLink>
  </div>
</template>

<style scoped>
.delete-actions {
  display: flex;
  gap: 10px;
}
.delete-actions .button {
  flex: 1;
}
.delete-button {
  color: #fff;
  background: var(--color-danger);
}
</style>
