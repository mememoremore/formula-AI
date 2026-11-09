<script setup lang="ts">
import type { BatchDraftImage } from '~/composables/useRecognitionBatchDraft'
import type { ComponentPublicInstance } from 'vue'
import { NuxtLink } from '#components'
import { workspaceFeedback } from '~/utils/workspace-feedback'

const props = defineProps<{ ownerId: string }>()
const fetcher = useAccountFetch()
const owner = toRef(props, 'ownerId')
const draft = useRecognitionBatchDraft(owner)
const { mode, images, busy, feedback, progress, pending, total, ready } = draft
const editing = ref<BatchDraftImage | null>(null)
const detecting = ref(false),
  detectedKeys = ref<string[]>([]),
  detectionProgress = ref(''),
  detectionFeedback = ref('')

type RegionEditor = { detect: () => Promise<boolean | undefined> }

const regionEditors = new Map<string, RegionEditor>()
let disposed = false,
  detectionGeneration = 0
const allDetected = computed(
  () =>
    images.value.length > 0 &&
    images.value.every((image) => detectedKeys.value.includes(image.key)),
)

function regionEditor(key: string, value: Element | ComponentPublicInstance | null) {
  if (value) regionEditors.set(key, value as unknown as RegionEditor)
  else regionEditors.delete(key)
}

async function detectAll() {
  if (busy.value || detecting.value || pending.value || mode.value !== 'multiple') return
  detecting.value = true
  detectionFeedback.value = ''

  const generation = ++detectionGeneration
  let failed = 0

  try {
    for (const [index, image] of images.value.entries()) {
      if (disposed || generation !== detectionGeneration) return
      if (detectedKeys.value.includes(image.key)) continue
      detectionProgress.value = '正在检测图片 ' + (index + 1) + '/' + images.value.length

      const success = await regionEditors.get(image.key)?.detect()

      if (disposed || generation !== detectionGeneration) return
      if (success) detectedKeys.value.push(image.key)
      else failed++
    }
    if (failed)
      detectionFeedback.value =
        failed + '张图片检测未完成，请重试一键检测；已检测和手动调整的区域会保留。'
  } finally {
    if (generation === detectionGeneration) {
      detecting.value = false
      detectionProgress.value = ''
    }
  }
}

watch(owner, () => {
  detectionGeneration++
  detecting.value = false
  detectionProgress.value = ''
  detectionFeedback.value = ''
  detectedKeys.value = []
})
watch(
  () => images.value.map((image) => image.key),
  (keys) => {
    detectedKeys.value = detectedKeys.value.filter((key) => keys.includes(key))
  },
)
onScopeDispose(() => {
  disposed = true
  detectionGeneration++
})

const recent = await useAsyncData('recognition-batches-' + owner.value, () =>
  fetcher<{ items: { id: string; mode: string; status: string; createdAt: string }[] }>(
    '/api/account/recognition-batches',
    { retry: 0, headers: { 'x-account-id': props.ownerId } },
  ),
)
const managingBatches = ref(false),
  selectedBatches = ref<string[]>([]),
  deletingBatches = ref(false),
  confirmBatchDelete = ref(false),
  batchDeleteError = ref('')

watch(
  () => recent.data.value?.items,
  (items) => {
    const visible = new Set(items?.map((item) => item.id))

    selectedBatches.value = selectedBatches.value.filter((id) => visible.has(id))
  },
)

function toggleBatchManager() {
  managingBatches.value = !managingBatches.value
  selectedBatches.value = []
}

function askBatchDelete() {
  batchDeleteError.value = ''
  confirmBatchDelete.value = true
}

const removableBatches = computed(
  () =>
    recent.data.value?.items.filter((item) => ['COMPLETED', 'CANCELLED'].includes(item.status)) ??
    [],
)

async function deleteBatches() {
  if (deletingBatches.value || !selectedBatches.value.length) return
  deletingBatches.value = true
  batchDeleteError.value = ''
  try {
    await fetcher('/api/account/recognition-batches/batch-delete', {
      method: 'POST',
      body: { ids: [...selectedBatches.value] },
      headers: { 'x-account-id': props.ownerId },
      retry: 0,
      timeout: 20000,
    })
    confirmBatchDelete.value = false
    selectedBatches.value = []
    await recent.refresh()
  } catch (error) {
    batchDeleteError.value = workspaceFeedback(error, '暂时无法删除批次记录，请重试。')
  } finally {
    deletingBatches.value = false
  }
}

const labels: Record<string, string> = {
  RUNNING: '处理中',
  PAUSED: '已暂停',
  COMPLETED: '已结束',
  CANCELLED: '已停止',
}

function prepared(files: File[]) {
  if (editing.value) draft.prepare(editing.value.key, files)
  editing.value = null
}
</script>
<template>
  <PageHeader title="批量处理" back-to="/" />
  <p class="info-note">先选择本批图片的类型，单公式和多公式分开处理；每批最多10张。</p>
  <div v-if="draft.recoverableDraft.value && !pending && !images.length" class="card status-panel">
    <p>有一份未开始识别的本机草稿，可继续准备。</p>
    <div class="row">
      <button class="button button-secondary" @click="draft.restoreDraft">继续上次准备</button>
      <button class="text-button" @click="draft.discardDraft">丢弃草稿</button>
    </div>
  </div>
  <p v-if="draft.draftStatus.value" class="info-note" role="status">
    {{ draft.draftStatus.value }}
  </p>
  <div class="batch-modes" aria-label="批次识别模式">
    <button
      class="card mode-card"
      :class="{ selected: mode === 'single' }"
      :aria-pressed="mode === 'single'"
      :disabled="busy || detecting || !!pending"
      @click="draft.chooseMode('single')"
    >
      <AppIcon name="image" :size="25" />
      <strong>单公式批量</strong>
      <span>多张图片，每张图片都是单公式</span>
    </button>
    <button
      class="card mode-card"
      :class="{ selected: mode === 'multiple' }"
      :aria-pressed="mode === 'multiple'"
      :disabled="busy || detecting || !!pending"
      @click="draft.chooseMode('multiple')"
    >
      <AppIcon name="matrix" :size="25" />
      <strong>多公式批量</strong>
      <span>多张图片，每张图片都是多公式</span>
    </button>
  </div>
  <div v-if="pending" class="card status-panel">
    <p>有一个批次的提交结果尚未确认，请继续核对原批次。</p>
    <button class="button button-primary" :disabled="busy" @click="draft.start">
      {{ busy ? '正在核对…' : '继续确认原批次' }}
    </button>
  </div>
  <template v-else-if="mode">
    <label class="button button-secondary button-block batch-upload">
      <AppIcon name="imagePlus" :size="20" />
      选择多张图片
      <input
        class="sr-only"
        type="file"
        multiple
        accept="image/png,image/jpeg"
        aria-label="选择批量图片"
        :disabled="busy || detecting"
        @change="draft.selectImages"
      />
    </label>
    <p class="info-note">
      JPG/JPEG、PNG，每张不超过10MB；准备过程自动保存本机草稿；开始识别后可离开页面，稍后从本页继续查看。
    </p>
    <div class="stack section">
      <article v-for="(image, index) in images" :key="image.key" class="card draft-image">
        <header>
          <h2>图片 {{ index + 1 }} · {{ image.file.name }}</h2>
          <button
            class="icon-button"
            :aria-label="'移除图片 ' + (index + 1)"
            :disabled="busy || detecting"
            @click="draft.remove(image.key)"
          >
            <AppIcon name="close" :size="18" />
          </button>
        </header>
        <img :src="image.preview" :alt="'图片 ' + (index + 1) + ' 预览'" />
        <ImageQualityNote :file="image.file" />
        <p class="info-note">
          {{ image.parts.length ? '已准备 ' + image.parts.length + ' 条公式' : '尚未确认公式区域' }}
        </p>
        <fieldset v-if="mode === 'multiple'" class="region-selection" :disabled="detecting || busy">
          <MultiFormulaSelection
            :ref="(value) => regionEditor(image.key, value)"
            :file="image.file"
            :initial-regions="image.regions"
            :owner-id="owner"
            :disabled="busy"
            prepare-only
            inline-preparation
            @regions="(rows) => (image.regions = rows)"
            @prepared="(files) => draft.prepare(image.key, files)"
          />
        </fieldset>
        <div class="row image-actions">
          <button
            v-if="mode === 'single'"
            class="text-button"
            :disabled="busy"
            @click="editing = image"
          >
            调整裁剪
          </button>
          <button
            class="text-button"
            :disabled="busy || detecting || index === 0"
            :aria-label="'上移图片 ' + (index + 1)"
            @click="draft.move(image.key, -1)"
          >
            上移
          </button>
          <button
            class="text-button"
            :disabled="busy || detecting || index === images.length - 1"
            :aria-label="'下移图片 ' + (index + 1)"
            @click="draft.move(image.key, 1)"
          >
            下移
          </button>
        </div>
      </article>
    </div>
    <div v-if="images.length" class="batch-start section">
      <p class="info-note">
        共 {{ images.length }} 张图片、{{ total }} 条公式，每条公式占用1次识别额度。
      </p>
      <button
        v-if="mode === 'multiple'"
        class="button button-secondary button-block"
        :disabled="busy || detecting || allDetected"
        @click="detectAll"
      >
        {{ detecting ? detectionProgress : allDetected ? '已完成全部图片检测' : '一键检测' }}
      </button>
      <p v-if="mode === 'multiple'" class="info-note">
        检测后会展示全部公式区域；检查并手动调整不准确的区域，再开始批量识别。
      </p>
      <p v-if="detectionFeedback" class="error-text" role="alert">{{ detectionFeedback }}</p>
      <button
        class="button button-primary button-block"
        :disabled="busy || detecting || !ready"
        @click="draft.start"
      >
        {{ busy ? '正在准备批次…' : '开始批量识别' }}
      </button>
    </div>
  </template>
  <p v-if="progress" class="status-panel" role="status">{{ progress }}</p>
  <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
  <section class="section">
    <div class="section-heading">
      <h2>最近批次</h2>
      <button
        class="text-button manage-button"
        :disabled="deletingBatches || !!recent.error.value"
        @click="toggleBatchManager"
      >
        <AppIcon :name="managingBatches ? 'close' : 'pencil'" :size="13" />
        {{ managingBatches ? '取消管理' : '管理批次' }}
      </button>
    </div>
    <BulkSelectionBar
      v-if="managingBatches"
      :count="selectedBatches.length"
      :busy="deletingBatches"
      :available="removableBatches.length"
      @select-all="selectedBatches = removableBatches.map((item) => item.id)"
      @remove="askBatchDelete"
    />
    <p v-if="managingBatches" class="info-note">
      运行中或暂停的批次请先完成，再删除记录；删除记录会保留公式和原图。
    </p>
    <p v-if="recent.error.value" class="error-text">
      暂时无法读取批次。
      <button class="text-button" @click="recent.refresh()">重新加载</button>
    </p>
    <div v-else-if="recent.data.value?.items.length" class="stack section">
      <div v-for="batch in recent.data.value.items" :key="batch.id" class="batch-history-row">
        <label v-if="managingBatches" class="batch-select">
          <input
            v-model="selectedBatches"
            type="checkbox"
            :value="batch.id"
            :disabled="deletingBatches || !['COMPLETED', 'CANCELLED'].includes(batch.status)"
            :aria-label="'选择批次 ' + new Date(batch.createdAt).toLocaleString('zh-CN')"
          />
        </label>
        <component
          :is="managingBatches ? 'div' : NuxtLink"
          :to="managingBatches ? undefined : '/batches/' + batch.id"
          class="card batch-link"
        >
          <span>
            {{ batch.mode === 'single' ? '单公式批次' : '多公式批次' }} · {{ labels[batch.status] }}
          </span>
          <small>{{ new Date(batch.createdAt).toLocaleString('zh-CN') }}</small>
          <AppIcon v-if="!managingBatches" name="chevron" :size="16" />
        </component>
      </div>
    </div>
    <p v-else class="info-note">开始识别后，批次会保存在这里。</p>
  </section>
  <AppModal
    :open="confirmBatchDelete"
    title="删除所选批次记录"
    @close="!deletingBatches && (confirmBatchDelete = false)"
  >
    <div class="stack">
      <p>
        将从最近批次移除所选
        {{ selectedBatches.length }} 条批次记录，删除后不进入回收站且无法恢复；对应公式和原图保留。
      </p>
      <p v-if="batchDeleteError" class="error-text" role="alert">{{ batchDeleteError }}</p>
      <button
        class="button button-primary"
        :disabled="deletingBatches || !selectedBatches.length"
        @click="deleteBatches"
      >
        {{ deletingBatches ? '正在删除…' : '确认删除' }}
      </button>
    </div>
  </AppModal>
  <FormulaImageCropper
    v-if="editing && mode === 'single'"
    :file="editing.file"
    @close="editing = null"
    @selected="(file) => prepared([file])"
  />
</template>
<style scoped>
.batch-history-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.batch-history-row .batch-link {
  flex: 1;
  min-width: 0;
}
.batch-select {
  padding: 12px 0;
}
.batch-modes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 20px 0;
}
.mode-card {
  display: grid;
  justify-items: start;
  gap: 10px;
  padding: 16px;
  text-align: left;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.mode-card.selected {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
.mode-card strong {
  font-size: 15px;
}
.mode-card span {
  font-size: 12px;
  color: var(--color-muted);
  line-height: 1.7;
}
.mode-card .app-icon {
  color: var(--color-primary);
}
.batch-upload {
  margin: 16px 0 10px;
  cursor: pointer;
}
.draft-image {
  padding: 16px;
}
.region-selection {
  border: 0;
  padding: 0;
  margin: 12px 0;
  min-width: 0;
}
.draft-image header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.draft-image h2 {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.draft-image > img {
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  margin: 10px 0;
  background: white;
}
.image-actions {
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 10px;
}
.batch-start {
  display: grid;
  gap: 12px;
}
.batch-link {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 16px;
  font-size: 14px;
}
.batch-link small {
  color: var(--color-muted);
  grid-column: 1;
  font-size: 12px;
}
.batch-link .app-icon {
  grid-column: 2;
  grid-row: 1 / 3;
  align-self: center;
}
</style>
