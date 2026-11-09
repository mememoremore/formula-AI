<script setup lang="ts">
import type { RecognitionBatchView } from '#shared/types/recognition-batch'
import type { CategoryCollection } from '#shared/types/library'
import { workspaceFeedback } from '~/utils/workspace-feedback'

const props = defineProps<{ id: string; ownerId: string }>()
const fetcher = useAccountFetch(),
  invalidate = useFormulaViewsInvalidation(),
  toast = useToast()
const endpoint = '/api/account/recognition-batches/' + encodeURIComponent(props.id)
const busy = ref(false),
  feedback = ref(''),
  selected = ref<string[]>([]),
  categoryOpen = ref(false),
  categoryId = ref('')
let disposed = false,
  controller: AbortController | undefined

onScopeDispose(() => {
  disposed = true
  controller?.abort()
})

const request = useTaskPolling<RecognitionBatchView>(
  'recognition-batch-' + props.ownerId + '-' + props.id,
  endpoint,
  (batch) => batch.status === 'RUNNING',
  {
    paused: busy,
    read: async (signal) => {
      const batch = await fetcher<RecognitionBatchView>(endpoint, {
        signal,
        retry: 0,
        headers: { 'x-account-id': props.ownerId },
      })

      signal.throwIfAborted()
      if (disposed || batch.id !== props.id) throw new Error('批次响应已失效')
      return batch
    },
  },
)
const batch = request.data
const available = computed(
  () =>
    batch.value?.images.flatMap((image) =>
      image.parts.flatMap((part) =>
        part.status === 'COMPLETED' && part.formula ? [part.formula] : [],
      ),
    ) ?? [],
)
const chosen = computed(() =>
  available.value.filter((formula) => selected.value.includes(formula.id)),
)
const exportFormulas = computed(() =>
  chosen.value.map((formula) => ({
    id: formula.versionId,
    latex: formula.latex,
    label: formula.title,
  })),
)
const copyFormulas = computed(() => chosen.value.map((formula) => formula.latex))
const labels: Record<string, string> = {
  WAITING: '等待识别',
  QUEUED: '排队中',
  PROCESSING: '正在识别',
  COMPLETED: '已完成',
  FAILED: '识别失败',
  CANCELLED: '已停止',
}

watch(available, (formulas) => {
  selected.value = selected.value.filter((id) => formulas.some((formula) => formula.id === id))
})
watch(
  () => batch.value?.completed,
  (count, before) => {
    if (import.meta.client && count && count !== before) void invalidate(props.ownerId)
  },
)

function toggle(id: string) {
  if (busy.value) return
  if (selected.value.includes(id)) selected.value = selected.value.filter((value) => value !== id)
  else if (selected.value.length < 20) selected.value.push(id)
  else feedback.value = '每次最多选择20条公式，可以分次复制、导出或添加分类。'
}

function selectAll() {
  selected.value = available.value.slice(0, 20).map((formula) => formula.id)
}

async function retry() {
  if (busy.value) return
  busy.value = true
  feedback.value = ''
  controller = new AbortController()
  try {
    await fetcher(endpoint + '/retry', {
      method: 'POST',
      body: {
        failed:
          batch.value?.images.flatMap((image) =>
            image.parts
              .filter((part) => part.status === 'FAILED')
              .map((part) => ({ id: part.id, taskId: part.taskId })),
          ) ?? [],
      },
      signal: controller.signal,
      headers: { 'x-account-id': props.ownerId },
      retry: 0,
      timeout: 20000,
    })
    if (!disposed) await request.refresh()
  } catch (error) {
    if (!disposed)
      feedback.value = workspaceFeedback(error, '继续处理的结果尚未确认，请重新查看此批次。')
  } finally {
    busy.value = false
  }
}

const categories = ref<CategoryCollection | null>(null)

async function showCategories() {
  if (!chosen.value.length || busy.value) return
  busy.value = true
  feedback.value = ''
  controller = new AbortController()
  try {
    const value = await fetcher<CategoryCollection>('/api/account/categories', {
      signal: controller.signal,
      headers: { 'x-account-id': props.ownerId },
      retry: 0,
    })

    if (!disposed) {
      categories.value = value
      categoryId.value = ''
      categoryOpen.value = true
    }
  } catch (error) {
    if (!disposed) feedback.value = workspaceFeedback(error, '暂时无法读取分类。')
  } finally {
    busy.value = false
  }
}

async function categorize() {
  if (!chosen.value.length || busy.value) return
  busy.value = true
  feedback.value = ''
  controller = new AbortController()
  try {
    await fetcher(endpoint + '/category', {
      method: 'POST',
      body: {
        ids: chosen.value.map((formula) => formula.id),
        categoryId: categoryId.value || null,
      },
      signal: controller.signal,
      headers: { 'x-account-id': props.ownerId },
      retry: 0,
    })
    if (!disposed) {
      categoryOpen.value = false
      toast.showToast('已添加到公式库')
      await invalidate(props.ownerId)
    }
  } catch (error) {
    if (!disposed) feedback.value = workspaceFeedback(error, '添加分类失败，请重试。')
  } finally {
    busy.value = false
  }
}

type FailedPart = RecognitionBatchView['images'][number]['parts'][number]

const replaceTarget = ref<FailedPart | null>(null),
  replacement = shallowRef<File>(),
  replacementPreview = ref('')
let replacementUploadKey = '',
  replacementRequestKey = '',
  replacementFileId = ''

function clearReplacement() {
  if (replacementPreview.value) URL.revokeObjectURL(replacementPreview.value)
  replacement.value = undefined
  replacementPreview.value = ''
  replacementFileId = replacementUploadKey = replacementRequestKey = ''
}

function chooseReplacement(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  input.value = ''
  if (!file || busy.value) return
  if (
    !['image/jpeg', 'image/png'].includes(file.type) ||
    !file.size ||
    file.size > 10 * 1024 * 1024
  ) {
    feedback.value = '请选择10MB以内的JPG/JPEG、PNG图片。'
    return
  }
  clearReplacement()
  feedback.value = ''
  replacement.value = file
  replacementPreview.value = URL.createObjectURL(file)
  replacementUploadKey = crypto.randomUUID()
  replacementRequestKey = crypto.randomUUID()
}

function openReplacement(part: FailedPart) {
  if (busy.value) return
  clearReplacement()
  feedback.value = ''
  replaceTarget.value = part
}

async function replaceImage() {
  if (!replaceTarget.value || !replacement.value || busy.value) return
  busy.value = true
  feedback.value = ''
  controller = new AbortController()

  const target = replaceTarget.value

  try {
    if (!replacementFileId) {
      const upload = await fetcher<{ image: { id: string } }>('/api/account/files', {
        method: 'POST',
        body: replacement.value,
        signal: controller.signal,
        retry: 0,
        timeout: 60000,
        headers: {
          'x-account-id': props.ownerId,
          'content-type': replacement.value.type,
          'x-file-name': encodeURIComponent(replacement.value.name),
          'x-upload-key': replacementUploadKey,
        },
      })

      if (disposed) return
      replacementFileId = upload.image.id
    }
    await fetcher(endpoint + '/parts/' + target.id + '/replace', {
      method: 'POST',
      headers: { 'x-account-id': props.ownerId },
      signal: controller.signal,
      retry: 0,
      timeout: 20000,
      body: {
        fileId: replacementFileId,
        requestKey: replacementRequestKey,
        expectedTaskId: target.taskId,
        expectedFileId: target.fileId,
      },
    })
    if (!disposed) {
      replaceTarget.value = null
      clearReplacement()
      await request.refresh()
      toast.showToast('图片已替换，后台将继续识别')
    }
  } catch (error) {
    if (!disposed)
      feedback.value = workspaceFeedback(error, '上传或替换结果尚未确认，请使用当前图片继续重试。')
  } finally {
    if (!disposed) busy.value = false
  }
}

onScopeDispose(clearReplacement)
</script>
<template>
  <div v-if="!batch" class="card status-panel">
    <p>{{ request.error.value ? '暂时无法读取这个批次。' : '正在加载批次…' }}</p>
    <button v-if="request.error.value" class="text-button" @click="request.refresh()">
      重新加载
    </button>
  </div>
  <template v-else>
    <section class="card batch-progress" aria-live="polite">
      <h2>
        {{ batch.mode === 'single' ? '每张单公式' : '每张多公式' }} ·
        {{
          batch.status === 'RUNNING'
            ? '正在处理'
            : batch.status === 'PAUSED'
              ? '已暂停'
              : batch.status === 'CANCELLED'
                ? '已停止'
                : '处理结束'
        }}
      </h2>
      <progress
        :value="batch.completed + batch.failed + (batch.stopped ?? 0)"
        :max="batch.total"
        aria-label="批量识别进度"
      />
      <p class="info-note">
        共 {{ batch.images.length }} 张图片、{{ batch.total }} 条公式，已完成
        {{ batch.completed }} 条
        <span v-if="batch.failed">，失败 {{ batch.failed }} 条</span>
        <span v-if="batch.stopped">，已停止 {{ batch.stopped }} 条</span>
        。
      </p>
      <p v-if="batch.status === 'RUNNING'" class="info-note">
        后台按顺序识别，可以离开页面；返回“批量处理”继续查看。
      </p>
      <p
        v-if="batch.errorMessage"
        :class="batch.status === 'CANCELLED' ? 'info-note' : 'error-text'"
      >
        {{ batch.errorMessage }}
      </p>
      <button
        v-if="batch.status === 'PAUSED' || (batch.status === 'COMPLETED' && batch.failed)"
        class="button button-secondary"
        :disabled="busy"
        @click="retry"
      >
        {{ batch.status === 'PAUSED' ? '继续处理未完成项' : '仅重试失败项' }}
      </button>
      <p v-if="request.error.value" class="info-note">进度暂未更新，正在重新连接。</p>
    </section>
    <section v-if="available.length" class="card batch-actions section">
      <div class="selection-heading">
        <span>已选 {{ selected.length }} 条</span>
        <button class="text-button" :disabled="busy" @click="selectAll">
          {{ available.length > 20 ? '选择前20条' : '全选' }}
        </button>
        <button v-if="selected.length" class="text-button" :disabled="busy" @click="selected = []">
          取消选择
        </button>
      </div>
      <p class="info-note">结果已自动保存到未分类；勾选后可批量操作，每次最多20条。</p>
      <div v-if="chosen.length" class="result-actions">
        <BatchFormulaIntelligence
          :owner-id="ownerId"
          :formulas="chosen"
          @saved="request.refresh()"
        />
        <FormulaCopyAction :formulas="copyFormulas" preselected />
        <FormulaWordExport :formulas="exportFormulas" preselected />
        <StudySheetExport :ids="chosen.map((formula) => formula.id)" />
        <button class="button button-secondary" :disabled="busy" @click="showCategories">
          添加到公式库
        </button>
      </div>
    </section>
    <BatchDuplicateReview :owner-id="ownerId" :formulas="available" @saved="request.refresh()" />
    <p v-if="feedback" class="error-text section" role="alert">{{ feedback }}</p>
    <div class="stack section">
      <section v-for="image in batch.images" :key="image.id" class="card result-image">
        <h2>图片 {{ image.position + 1 }} · {{ image.name }}</h2>
        <details class="original-image">
          <summary>查看原图</summary>
          <img
            :src="'/api/account/files/' + image.fileId + '/content'"
            :alt="image.name"
            loading="lazy"
          />
        </details>
        <article v-for="part in image.parts" :key="part.id" class="result-part">
          <header>
            <label v-if="part.formula && part.status === 'COMPLETED'">
              <input
                type="checkbox"
                :checked="selected.includes(part.formula.id)"
                :disabled="busy"
                :aria-label="'选择图片' + (image.position + 1) + '公式' + (part.position + 1)"
                @change="toggle(part.formula.id)"
              />
              公式 {{ part.position + 1 }}
            </label>
            <span v-else>公式 {{ part.position + 1 }}</span>
            <div class="part-status-actions">
              <button
                v-if="part.status === 'FAILED' && batch.status !== 'CANCELLED'"
                class="text-button"
                :disabled="busy"
                @click="openReplacement(part)"
              >
                <AppIcon name="upload" :size="14" />
                重新上传公式图片
              </button>
              <span
                class="part-status"
                :class="{
                  failed: part.status === 'FAILED' && !part.errorMessage?.startsWith('已停止'),
                }"
              >
                {{ part.errorMessage?.startsWith('已停止') ? '已停止' : labels[part.status] }}
              </span>
            </div>
          </header>
          <div class="part-source">
            <p class="info-note">原始图片</p>
            <img
              :src="'/api/account/files/' + part.fileId + '/content'"
              :alt="'公式' + (part.position + 1) + '的原图区域'"
              loading="lazy"
            />
          </div>
          <template v-if="part.formula && part.status === 'COMPLETED'">
            <p class="info-note">识别公式</p>
            <MathFormula :latex="part.formula.latex" />
            <NuxtLink class="text-button" :to="'/formulas/' + part.formula.id">
              查看公式详情
              <AppIcon name="chevron" :size="16" />
            </NuxtLink>
          </template>
          <p v-else-if="part.status === 'COMPLETED'" class="info-note">这条公式已从公式库删除。</p>
          <p
            v-if="part.errorMessage"
            :class="part.status === 'CANCELLED' ? 'info-note' : 'error-text'"
          >
            {{ part.errorMessage }}
          </p>
        </article>
      </section>
    </div>
  </template>
  <AppModal
    :open="!!replaceTarget"
    title="重新上传公式图片"
    @close="!busy && ((replaceTarget = null), clearReplacement())"
  >
    <div class="stack">
      <p class="info-note">只重新识别当前失败公式，其他成功结果保留；重新识别使用1次识别额度。</p>
      <input
        type="file"
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        :disabled="busy"
        aria-label="重新上传公式图片"
        @change="chooseReplacement"
      />
      <img
        v-if="replacementPreview"
        :src="replacementPreview"
        alt="重新上传的公式图片预览"
        class="replacement-preview"
      />
      <p v-if="feedback" class="error-text" role="alert">{{ feedback }}</p>
      <button class="button button-primary" :disabled="busy || !replacement" @click="replaceImage">
        {{ busy ? '正在上传…' : '上传并重新识别' }}
      </button>
    </div>
  </AppModal>
  <AppModal :open="categoryOpen" title="添加到分类" @close="!busy && (categoryOpen = false)">
    <div class="stack">
      <select v-model="categoryId" class="input" aria-label="批量公式分类" :disabled="busy">
        <option value="">未分类</option>
        <option v-for="category in categories?.items" :key="category.id" :value="category.id">
          {{ category.name }}
        </option>
      </select>
      <p v-if="!categories?.items.length" class="info-note">暂无自建分类，可先到公式库管理分类。</p>
      <p v-if="feedback" class="error-text">{{ feedback }}</p>
      <button class="button button-primary" :disabled="busy || !chosen.length" @click="categorize">
        {{ busy ? '正在保存…' : '确认添加' }}
      </button>
    </div>
  </AppModal>
</template>
<style scoped>
.part-status-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}
.part-status-actions .text-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.replacement-preview {
  max-width: 100%;
  max-height: 260px;
  object-fit: contain;
}
.batch-progress,
.batch-actions,
.result-image {
  padding: 18px;
}
h2 {
  font-size: 16px;
  overflow-wrap: anywhere;
}
progress {
  width: 100%;
  height: 10px;
  margin: 16px 0 8px;
  accent-color: var(--color-primary);
}
.batch-progress .button {
  margin-top: 12px;
}
.selection-heading,
.result-part header {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.selection-heading {
  font-size: 13px;
  margin-bottom: 10px;
}
.result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}
.result-actions .button {
  font-size: 13px;
  flex: 1 1 auto;
}
.original-image {
  margin: 14px 0;
  font-size: 13px;
  color: var(--color-muted);
}
.original-image img {
  width: 100%;
  max-height: 250px;
  object-fit: contain;
  margin-top: 12px;
}
.result-part {
  border-top: 1px solid var(--color-border);
  padding: 16px 0 4px;
}
.part-source {
  margin: 14px 0;
}
.part-source img {
  display: block;
  max-width: 100%;
  max-height: 220px;
  margin: 8px auto;
  object-fit: contain;
}
.result-part + .result-part {
  margin-top: 12px;
}
.result-part header,
.result-part label {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.part-status {
  margin-left: auto;
  color: var(--color-muted);
}
.part-status.failed {
  color: var(--color-danger);
}
.result-part .text-button {
  font-size: 13px;
  margin-top: 10px;
}
</style>
