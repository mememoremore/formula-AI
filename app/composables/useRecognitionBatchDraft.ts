import { preparationStorage, type RegionDraft } from '~/utils/preparation-storage'
import type { RecognitionBatchInput } from '#shared/schemas/recognition-batch'
import { recognitionBatchInputSchema } from '#shared/schemas/recognition-batch'
import { workspaceFeedback } from '~/utils/workspace-feedback'
import type { UsageOverview } from '#shared/types/tasks'
import { toRaw } from 'vue'

export interface BatchDraftImage {
  key: string
  file: File
  preview: string
  parts: File[]
  regions?: RegionDraft[]
  partPreviews: string[]
  uploadKey: string
  partKeys: string[]
  originalId?: string
  partIds: (string | undefined)[]
}
export function useRecognitionBatchDraft(owner: Ref<string | undefined>) {
  const fetcher = useAccountFetch()
  const mode = ref<'single' | 'multiple' | null>(null),
    images = ref<BatchDraftImage[]>([])
  const busy = ref(false),
    feedback = ref(''),
    progress = ref(''),
    pending = ref<RecognitionBatchInput | null>(null)
  let controller: AbortController | undefined,
    disposed = false,
    allowLeave = false,
    requestKey = ''
  const receiptKey = () => 'moxi:recognition-batch-pending:' + owner.value
  const total = computed(() => images.value.reduce((sum, image) => sum + image.parts.length, 0))
  const ready = computed(
    () =>
      !!mode.value &&
      images.value.length > 0 &&
      images.value.every((image) =>
        mode.value === 'single' ? image.parts.length === 1 : image.parts.length >= 2,
      ),
  )

  interface StoredDraft {
    mode: 'single' | 'multiple'
    images: Omit<BatchDraftImage, 'preview' | 'partPreviews'>[]
  }

  const recoverableDraft = ref<StoredDraft | null>(null),
    draftStatus = ref(''),
    draftSaving = ref(false)
  let draftTimer: ReturnType<typeof setTimeout> | undefined,
    draftLoaded = false,
    suppressDraft = false
  const draftKey = (id: string) => 'batch:' + id

  async function saveDraft() {
    const id = owner.value

    if (!id || !draftLoaded || suppressDraft || disposed) return false
    draftSaving.value = true
    try {
      const snapshot: StoredDraft = {
        mode: mode.value ?? 'single',
        images: images.value.map((image) => ({
          key: image.key,
          file: toRaw(image.file),
          parts: image.parts.map(toRaw),
          uploadKey: image.uploadKey,
          partKeys: [...image.partKeys],
          originalId: image.originalId,
          partIds: [...image.partIds],
          regions: image.regions?.map((row) => ({
            ...row,
            bbox: [...row.bbox],
            file: toRaw(row.file),
          })),
        })),
      }
      const bytes = snapshot.images.reduce(
        (n, image) => n + image.file.size + image.parts.reduce((m, file) => m + file.size, 0),
        0,
      )

      if (bytes > 200 * 1024 * 1024) throw new Error('本机草稿超过200MB，请减少图片')
      await preparationStorage(draftKey(id), 'write', snapshot)
      if (owner.value === id) draftStatus.value = images.value.length ? '已自动保存本机草稿' : ''
      return true
    } catch {
      if (owner.value === id)
        draftStatus.value = '本机草稿未保存，请保持页面打开或检查浏览器存储空间'
      return false
    } finally {
      draftSaving.value = false
    }
  }

  watch(
    [mode, images],
    () => {
      if (!draftLoaded || suppressDraft) return
      clearTimeout(draftTimer)
      draftStatus.value = '正在保存本机草稿…'
      draftTimer = setTimeout(() => void saveDraft(), 700)
    },
    { deep: true },
  )

  async function loadDraft() {
    const id = owner.value

    draftLoaded = false
    recoverableDraft.value = null
    clearTimeout(draftTimer)
    if (!id) return
    try {
      const row = await preparationStorage<StoredDraft>(draftKey(id), 'read')

      if (disposed || owner.value !== id) return
      if (
        row &&
        ['single', 'multiple'].includes(row.mode) &&
        Array.isArray(row.images) &&
        row.images.length > 0 &&
        row.images.length <= 10 &&
        row.images.every(
          (image) =>
            image.file instanceof File &&
            Array.isArray(image.parts) &&
            image.parts.every((file) => file instanceof File),
        )
      )
        recoverableDraft.value = row
    } catch {
      draftStatus.value = '浏览器暂时无法读取本机草稿'
    } finally {
      if (owner.value === id) draftLoaded = true
    }
  }

  function restoreDraft() {
    const row = recoverableDraft.value

    if (!row || busy.value || pending.value) return
    reset()
    mode.value = row.mode
    images.value = row.images.map((image) => ({
      ...image,
      preview: URL.createObjectURL(image.file),
      partPreviews: image.parts.map((file) => URL.createObjectURL(file)),
    }))
    recoverableDraft.value = null
    draftStatus.value = '已恢复本机草稿，请核对后开始识别'
  }

  async function discardDraft() {
    if (!owner.value) return
    await preparationStorage(draftKey(owner.value), 'delete')
    recoverableDraft.value = null
  }

  onMounted(() => {
    void loadDraft()
    window.addEventListener('beforeunload', guardDraft)
  })

  function guardDraft(event: BeforeUnloadEvent) {
    if (images.value.length && (draftSaving.value || draftStatus.value === '正在保存本机草稿…')) {
      event.preventDefault()
      event.returnValue = ''
    }
  }

  function release(image: BatchDraftImage) {
    URL.revokeObjectURL(image.preview)
    image.partPreviews.forEach((url) => URL.revokeObjectURL(url))
  }

  function reset() {
    images.value.forEach(release)
    images.value = []
    requestKey = ''
    feedback.value = ''
  }

  function chooseMode(value: 'single' | 'multiple') {
    if (busy.value || pending.value || mode.value === value) return
    if (images.value.length && !window.confirm('切换模式需要重新选择本批图片，是否继续？')) return
    reset()
    mode.value = value
  }

  async function selectImages(event: Event) {
    const input = event.target as HTMLInputElement,
      files = Array.from(input.files ?? [])

    input.value = ''
    if (!files.length || !mode.value || busy.value || pending.value) return
    if (images.value.length + files.length > 10) {
      feedback.value = '每批最多10张图片，请减少后重新选择。'
      return
    }
    busy.value = true
    feedback.value = ''

    const accepted: BatchDraftImage[] = []

    try {
      for (const file of files) {
        if (
          !['image/jpeg', 'image/png'].includes(file.type) ||
          !file.size ||
          file.size > 10 * 1024 * 1024
        )
          throw new Error('请选择每张不超过10MB的 JPG/JPEG、PNG 图片。')

        const preview = URL.createObjectURL(file)

        try {
          const image = new Image()

          image.src = preview
          await image.decode()
          if (image.naturalWidth * image.naturalHeight > 20_000_000)
            throw new Error('图片不能超过2000万像素。')
        } catch (error) {
          URL.revokeObjectURL(preview)
          throw error
        }

        const key = crypto.randomUUID()

        accepted.push({
          key,
          file,
          preview,
          parts: mode.value === 'single' ? [file] : [],
          partPreviews: [],
          uploadKey: key,
          partKeys: [key],
          partIds: [],
        })
      }
      if (disposed) accepted.forEach(release)
      else images.value.push(...accepted)
    } catch (error) {
      accepted.forEach(release)
      feedback.value = error instanceof Error ? error.message : '图片无法打开。'
    } finally {
      busy.value = false
    }
  }

  function remove(key: string) {
    if (busy.value || pending.value) return

    const index = images.value.findIndex((image) => image.key === key)

    if (index >= 0) {
      release(images.value[index]!)
      images.value.splice(index, 1)
    }
  }

  function move(key: string, direction: number) {
    if (busy.value || pending.value) return

    const index = images.value.findIndex((image) => image.key === key),
      target = index + direction

    if (index < 0 || target < 0 || target >= images.value.length) return

    const [image] = images.value.splice(index, 1)

    images.value.splice(target, 0, image!)
  }

  function prepare(key: string, files: File[]) {
    const image = images.value.find((image) => image.key === key)

    if (!image || busy.value || pending.value) return
    image.partPreviews.forEach((url) => URL.revokeObjectURL(url))
    image.parts = files
    image.partPreviews = files.map((file) => URL.createObjectURL(file))
    image.partKeys = files.map(() => crypto.randomUUID())
    image.partIds = []
  }

  // Ordinary multi-formula uploads use the same durable queue as multi-image batches.
  function prepareImage(file: File, parts: File[]) {
    if (busy.value || pending.value || !parts.length || parts.length > 20) return false

    const existing = images.value[0]

    if (
      images.value.length === 1 &&
      existing &&
      toRaw(existing.file) === toRaw(file) &&
      existing.parts.length === parts.length &&
      existing.parts.every((part, index) => toRaw(part) === toRaw(parts[index]))
    )
      return true
    reset()
    mode.value = parts.length === 1 ? 'single' : 'multiple'

    const key = crypto.randomUUID()

    images.value = [
      {
        key,
        file,
        preview: URL.createObjectURL(file),
        parts,
        partPreviews: [],
        uploadKey: key,
        partKeys: parts.map(() => crypto.randomUUID()),
        partIds: [],
      },
    ]
    return true
  }

  async function wait(signal: AbortSignal) {
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', done)
        resolve()
      }
      const timer = setTimeout(done, 5000)

      signal.addEventListener('abort', done, { once: true })
    })
    signal.throwIfAborted()
  }

  async function upload(file: File, key: string, expected: string, signal: AbortSignal) {
    while (true) {
      signal.throwIfAborted()
      try {
        const result = await fetcher<{ image: { id: string } }>('/api/account/files', {
          method: 'POST',
          body: file,
          headers: {
            'content-type': file.type,
            'x-file-name': encodeURIComponent(file.name),
            'x-upload-key': key,
            'x-account-id': expected,
          },
          signal,
          timeout: 60000,
          retry: 0,
        })

        return result.image.id
      } catch (error) {
        const failure = error as { statusCode?: number; data?: { data?: { code?: string } } }

        if (
          failure.statusCode === 429 &&
          ['UPLOAD_RATE', 'UPLOAD_BUSY'].includes(failure.data?.data?.code ?? '')
        ) {
          progress.value = '上传正在排队，稍后自动继续…'
          await wait(signal)
          continue
        }
        throw error
      }
    }
  }

  async function start() {
    const expected = owner.value

    if (!expected || busy.value || (!pending.value && !ready.value)) return
    busy.value = true
    feedback.value = ''
    controller = new AbortController()

    const signal = controller.signal,
      key = receiptKey()

    try {
      let body = pending.value

      if (!body) {
        const usage = await fetcher<UsageOverview>('/api/account/usage', {
          signal,
          retry: 0,
          headers: { 'x-account-id': expected },
        })
        const remaining = usage.items.find((item) => item.kind === 'RECOGNITION')?.remaining

        if (remaining === undefined) {
          feedback.value = '暂时无法确认识别额度，请稍后重试。'
          return
        }
        if (total.value > remaining) {
          feedback.value = `本批次共${total.value}条公式，今日剩余${remaining}次，请减少图片或区域。`
          return
        }
        for (const [index, image] of images.value.entries()) {
          progress.value = '正在上传图片 ' + (index + 1) + '/' + images.value.length
          image.originalId ??= await upload(image.file, image.uploadKey, expected, signal)
          for (const [position, file] of image.parts.entries()) {
            progress.value =
              '正在上传图片 ' +
              (index + 1) +
              ' 的公式区域 ' +
              (position + 1) +
              '/' +
              image.parts.length
            image.partIds[position] ??=
              file === image.file
                ? image.originalId
                : await upload(file, image.partKeys[position]!, expected, signal)
          }
        }
        requestKey ||= crypto.randomUUID()
        body = {
          requestKey,
          mode: mode.value!,
          images: images.value.map((image) => ({
            fileId: image.originalId!,
            parts: image.partIds.map((fileId) => ({ fileId: fileId! })),
          })),
        }
        recognitionBatchInputSchema.parse(body)
        sessionStorage.setItem(key, JSON.stringify(body))
        pending.value = body
      }
      progress.value = '正在创建批次…'

      const batch = await fetcher<{ id: string }>('/api/account/recognition-batches', {
        method: 'POST',
        body,
        headers: { 'x-account-id': expected },
        signal,
        retry: 0,
        timeout: 20000,
      })

      signal.throwIfAborted()
      if (disposed || owner.value !== expected) return
      suppressDraft = true
      clearTimeout(draftTimer)
      await preparationStorage(draftKey(expected), 'delete').catch(() => undefined)
      allowLeave = true
      await navigateTo('/batches/' + batch.id)
      sessionStorage.removeItem(key)
      pending.value = null
      return batch.id
    } catch (error) {
      if (!disposed && !signal.aborted) {
        feedback.value = workspaceFeedback(
          error,
          '提交结果尚未确认，请继续原批次；已上传的图片不会重复上传。',
        )

        const status = (error as { statusCode?: number }).statusCode

        if (status && status >= 400 && status < 500 && status !== 408) {
          sessionStorage.removeItem(key)
          pending.value = null
          requestKey = ''
          if (status === 404) {
            // A saved preparation may outlive unreferenced server uploads.
            // Keep the local bytes and upload them under fresh keys on retry.
            for (const image of images.value) {
              image.originalId = undefined
              image.partIds = []
              image.uploadKey = crypto.randomUUID()
              image.partKeys = image.parts.map(() => crypto.randomUUID())
            }
          }
        }
      }
    } finally {
      busy.value = false
      progress.value = ''
      controller = undefined
    }
  }

  onMounted(() => {
    try {
      const raw = sessionStorage.getItem(receiptKey())

      if (raw && raw.length < 30000) {
        const value = recognitionBatchInputSchema.safeParse(JSON.parse(raw))

        if (value.success) pending.value = value.data
      }
    } catch {
      feedback.value = '暂时无法读取待确认批次，请检查会话存储。'
    }
  })
  watch(owner, () => {
    draftLoaded = false
    clearTimeout(draftTimer)
    void loadDraft()
    controller?.abort()
    reset()
    pending.value = null
  })
  onBeforeRouteLeave(async () => {
    if (allowLeave || pending.value || !images.value.length) return true
    clearTimeout(draftTimer)
    if (await saveDraft()) return true
    return window.confirm('本机草稿未保存，离开后需要重新选择，是否继续？')
  })
  onScopeDispose(() => {
    disposed = true
    clearTimeout(draftTimer)
    if (import.meta.client) window.removeEventListener('beforeunload', guardDraft)
    controller?.abort()
    images.value.forEach(release)
  })
  return {
    mode,
    recoverableDraft,
    draftStatus,
    draftSaving,
    restoreDraft,
    discardDraft,
    images,
    busy,
    feedback,
    progress,
    pending,
    total,
    ready,
    chooseMode,
    selectImages,
    remove,
    move,
    prepare,
    prepareImage,
    start,
  }
}
