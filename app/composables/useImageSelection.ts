/** 登录往返保留当前标签页的 File；不把图片写入持久化浏览器存储。 */
export function useImageSelection() {
  const { replacePreview, preview } = useUploadPreview()
  const { file, originalFile } = useNuxtApp().$uploadDraft
  if (import.meta.client && !file.value && preview.value?.formulaId) replacePreview(null)
  const checking = ref(false)
  const selectionError = ref('')
  let selection = 0
  let disposed = false
  const decoding = new Set<string>()
  function releaseDecoding() {
    for (const url of decoding) URL.revokeObjectURL(url)
    decoding.clear()
  }
  function removeImage() {
    selection++
    releaseDecoding()
    checking.value = false
    selectionError.value = ''
    file.value = null
    replacePreview(null)
  }
  onScopeDispose(() => {
    disposed = true
    selection++
    releaseDecoding()
  })

  async function selectImage(event: Event) {
    const input = event.target as HTMLInputElement
    const selected = input.files?.[0]
    input.value = ''
    if (!selected) return
    const token = ++selection
    releaseDecoding()
    checking.value = false
    file.value = null
    selectionError.value = ''
    replacePreview(null)
    if (!['image/jpeg', 'image/png'].includes(selected.type)) {
      selectionError.value = '请选择 JPEG 或 PNG 图片。'
      return
    }
    if (!selected.size || selected.size > 10 * 1024 * 1024) {
      selectionError.value = '图片不能为空，且不能超过 10MB。'
      return
    }
    checking.value = true
    const url = URL.createObjectURL(selected)
    decoding.add(url)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      if (image.naturalWidth * image.naturalHeight > 20_000_000) throw new Error('pixels')
      if (disposed || selection !== token) {
        URL.revokeObjectURL(url)
        return
      }
      file.value = selected
      originalFile.value = selected
      decoding.delete(url)
      replacePreview({
        url,
        name: selected.name,
        size: selected.size,
        mimeType: selected.type as 'image/jpeg' | 'image/png',
      })
    } catch (error) {
      URL.revokeObjectURL(url)
      if (!disposed && selection === token)
        selectionError.value =
          error instanceof Error && error.message === 'pixels'
            ? '图片不能超过 2000 万像素，请缩小后重试。'
            : '图片无法打开，请换一张完整的图片。'
    } finally {
      decoding.delete(url)
      if (!disposed && selection === token) checking.value = false
    }
  }
  function applyCrop(value: File) {
    if (!originalFile.value) return
    selection++
    file.value = value
    replacePreview({
      url: URL.createObjectURL(value),
      name: value.name,
      size: value.size,
      mimeType: value.type as 'image/jpeg' | 'image/png',
    })
  }
  return { file, originalFile, checking, selectionError, selectImage, removeImage, applyCrop }
}
