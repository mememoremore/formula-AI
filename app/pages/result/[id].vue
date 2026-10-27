<script setup lang="ts">
import { formulaDraftChanged, formulaDraftFeedback } from '~/utils/formula-editor'
definePageMeta({ bottomNav: false, contentWidth: 'reading' })
useHead({ title: '演示公式 · Formula AI' })
const route = useRoute()
const { formulas, categories, toggleFavorite, updateFormula } = useDemoLibrary()
const { preview } = useUploadPreview()
const { showToast } = useToast()
const formula = computed(() => formulas.value.find((item) => item.id === route.params.id))
const categoryName = computed(
  () => categories.value.find((item) => item.id === formula.value?.categoryId)?.name ?? '未分类',
)
const image = computed(() =>
  preview.value?.formulaId === formula.value?.id ? preview.value?.url : undefined,
)
const showEditor = ref(false),
  showCategory = ref(false),
  showVersions = ref(false),
  showExport = ref(false)
const title = ref(''),
  latex = ref(''),
  categoryId = ref(''),
  feedback = ref('')
const original = ref({ title: '', latex: '', categoryId: '' })
const saving = ref(false)
const validation = computed(() => formulaDraftFeedback(title.value, latex.value))
const editorDirty = computed(
  () =>
    formulaDraftChanged({ title: title.value, latex: latex.value }, original.value) ||
    categoryId.value !== original.value.categoryId,
)
const { canLeave } = useFormulaDraftGuard(showEditor, editorDirty, saving)
const versions = computed(() =>
  (formula.value?.versions ?? []).map((version, index) => ({
    ...version,
    number: index + 1,
    label: index === 0 ? '本机原始内容' : '本机修订',
    to: {
      path: '/ai/new',
      query: { space: 'demo', formulaId: formula.value!.id, demoVersionId: version.id },
    },
  })),
)
watch(
  () => route.params.id,
  () => {
    showEditor.value = false
    showVersions.value = false
    showCategory.value = false
    showExport.value = false
  },
)
function edit() {
  if (!formula.value) return
  title.value = formula.value.title
  latex.value = formula.value.latex
  categoryId.value = formula.value.categoryId ?? ''
  original.value = { title: title.value, latex: latex.value, categoryId: categoryId.value }
  feedback.value = ''
  showEditor.value = true
}
function closeEditor() {
  if (canLeave()) showEditor.value = false
}
function save() {
  if (!formula.value || validation.value || !editorDirty.value) return
  if (!updateFormula(formula.value.id, latex.value, title.value, categoryId.value || null)) {
    feedback.value = '请填写名称和 LaTeX，公式最长 5000 字。'
    return
  }
  showEditor.value = false
  showToast('已保存到本机演示。')
}
function categorize() {
  categoryId.value = formula.value?.categoryId ?? ''
  showCategory.value = true
}
function saveCategory() {
  if (!formula.value) return
  updateFormula(
    formula.value.id,
    formula.value.latex,
    formula.value.title,
    categoryId.value || null,
  )
  showCategory.value = false
  showToast('分类已更新。')
}
</script>
<template>
  <PageHeader title="演示公式" back-to="/library?space=demo" />
  <template v-if="formula">
    <FormulaDetailContent
      :key="formula.id"
      :title="formula.title"
      :latex="formula.latex"
      :version="formula.versions.length"
      :version-count="formula.versions.length"
      :image-src="image"
      :original-latex="formula.originalLatex"
      :sample="formula.source === 'demo'"
      badge="本机演示"
      @edit="edit"
      @versions="showVersions = true"
    >
      <template #organization>
        <div class="organization-row">
          <button class="text-button" @click="categorize">
            <AppIcon name="book" :size="15" />
            {{ categoryName }}
            <AppIcon name="pencil" :size="12" />
          </button>
          <FavoriteButton
            :active="formula.favorite"
            :label="formula.favorite ? '取消收藏' : '收藏公式'"
            @toggle="toggleFavorite(formula.id)"
          />
        </div>
      </template>
      <template #actions>
        <NuxtLink
          :to="{ path: '/ai/new', query: { space: 'demo', formulaId: formula.id } }"
          class="button button-primary button-block"
        >
          <AppIcon name="sparkles" :size="19" />
          AI 解析
        </NuxtLink>
        <button class="button button-white button-block export-button" @click="showExport = true">
          <AppIcon name="download" :size="18" />
          Word 导出
        </button>
      </template>
      <template #note>
        本机示例与修改只保存于当前浏览器，不会自动导入账号。{{
          formula.source === 'mock-recognition' ? '模拟结果不代表所选图片内容。' : ''
        }}
      </template>
    </FormulaDetailContent>
    <AppModal :open="showEditor" title="编辑公式" sheet @close="closeEditor">
      <form class="stack" @submit.prevent="save">
        <label>
          <span class="field-label">公式名称</span>
          <input v-model="title" class="input" maxlength="100" required />
        </label>
        <label>
          <span class="field-label">LaTeX</span>
          <textarea
            v-model="latex"
            class="input latex-editor"
            maxlength="5000"
            required
            spellcheck="false"
            :aria-invalid="!!validation"
            :aria-describedby="validation ? 'demo-draft-validation' : undefined"
          />
        </label>
        <div class="paper-preview editor-preview">
          <MathFormula :latex="latex" tabindex="0" aria-label="编辑预览，可横向滚动" />
        </div>
        <p v-if="validation" id="demo-draft-validation" class="error-text" role="status">
          {{ validation }}
        </p>
        <label>
          <span class="field-label">分类</span>
          <select v-model="categoryId" class="input">
            <option value="">未分类</option>
            <option v-for="item in categories" :key="item.id" :value="item.id">
              {{ item.name }}
            </option>
          </select>
        </label>
        <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
        <div class="editor-actions">
          <button class="button button-white" type="button" @click="closeEditor">取消</button>
          <button
            class="button button-primary"
            type="submit"
            :disabled="!!validation || !editorDirty"
          >
            保存修改
          </button>
        </div>
      </form>
    </AppModal>
    <AppModal :open="showCategory" title="选择分类" sheet @close="showCategory = false">
      <form class="stack" @submit.prevent="saveCategory">
        <label class="sr-only" for="demo-category">选择分类</label>
        <select id="demo-category" v-model="categoryId" class="input">
          <option value="">未分类</option>
          <option v-for="item in categories" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
        <button class="button button-primary" type="submit">保存分类</button>
      </form>
    </AppModal>
    <FormulaVersions :open="showVersions" :versions="versions" @close="showVersions = false" />
    <AppModal :open="showExport" title="使用账号公式导出 Word" @close="showExport = false">
      <p class="prose">
        本机演示公式不能直接生成账号文档。登录后上传公式图片，即可在账号公式详情中导出；演示数据不会自动导入。
      </p>
      <NuxtLink to="/login?redirect=/upload" class="button button-primary button-block section">
        登录并上传公式
      </NuxtLink>
      <button class="text-button" @click="showExport = false">继续查看演示公式</button>
    </AppModal>
  </template>
  <EmptyState
    v-else
    title="未找到这条公式"
    description="记录可能来自其他浏览器，或本机演示数据已被清除。"
    action-label="返回演示公式库"
    action-to="/library?space=demo"
  />
</template>
<style scoped>
.organization-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 12px;
}
.export-button {
  margin-top: 12px;
}
.organization-row > .text-button {
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: left;
}
.editor-preview {
  min-width: 0;
  padding: 18px;
}
.latex-editor {
  min-height: 150px;
  font:
    13px/1.8 Consolas,
    monospace;
}
.editor-actions {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
}
</style>
