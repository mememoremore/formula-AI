<script setup lang="ts">
import type Cropper from 'cropperjs'
import { containsCrop, cropOutputSize, transformedImageBounds } from '#shared/image-crop'
const cropperTemplate = `
<cropper-canvas background>
<cropper-image scalable translatable>
</cropper-image>
<cropper-shade hidden>
</cropper-shade>
<cropper-handle action="move" plain>
</cropper-handle>
<cropper-selection movable resizable keyboard precise>
<cropper-grid covered>
</cropper-grid>
<cropper-crosshair centered>
</cropper-crosshair>
<cropper-handle action="move" theme-color="rgba(255,255,255,.12)">
</cropper-handle>
<cropper-handle action="n-resize">
</cropper-handle>
<cropper-handle action="e-resize">
</cropper-handle>
<cropper-handle action="s-resize">
</cropper-handle>
<cropper-handle action="w-resize">
</cropper-handle>
<cropper-handle action="ne-resize">
</cropper-handle>
<cropper-handle action="nw-resize">
</cropper-handle>
<cropper-handle action="se-resize">
</cropper-handle>
<cropper-handle action="sw-resize">
</cropper-handle>
</cropper-selection>
</cropper-canvas>
`
const props = defineProps<{ file: File }>()
const emit = defineEmits<{ close: []; selected: [file: File] }>()
const host = ref<HTMLDivElement>(),
  ready = ref(false),
  exporting = ref(false),
  error = ref('')
let cropper: Cropper | undefined,
  sourceUrl = '',
  sourceImage: HTMLImageElement | undefined,
  disposed = false,
  guard = false
function selectionBounds() {
  const selection = cropper?.getCropperSelection(),
    canvas = cropper?.getCropperCanvas()
  if (!selection || !canvas) return null
  const rect = canvas.getBoundingClientRect()
  return {
    left: rect.left + selection.x,
    top: rect.top + selection.y,
    width: selection.width,
    height: selection.height,
  }
}
function reset() {
  const image = cropper?.getCropperImage(),
    selection = cropper?.getCropperSelection(),
    canvas = cropper?.getCropperCanvas()
  if (!image || !selection || !canvas) return
  guard = false
  image.$setTransform(1, 0, 0, 1, 0, 0).$center('contain')
  const rect = image.getBoundingClientRect(),
    parent = canvas.getBoundingClientRect()
  selection.$change(rect.left - parent.left, rect.top - parent.top, rect.width, rect.height)
  guard = true
}
function zoom(amount: number) {
  cropper?.getCropperImage()?.$zoom(amount)
}
function close() {
  if (!exporting.value) emit('close')
}
async function complete() {
  if (!ready.value || exporting.value || !sourceImage) return
  const image = cropper?.getCropperImage(),
    selection = cropper?.getCropperSelection(),
    bounds = selectionBounds()
  if (!image || !selection || !bounds) return
  exporting.value = true
  error.value = ''
  let output: HTMLCanvasElement | undefined
  try {
    const size = cropOutputSize(
      sourceImage.naturalWidth,
      sourceImage.naturalHeight,
      image.getBoundingClientRect(),
      bounds,
    )
    output = await selection.$toCanvas({
      ...size,
      beforeDraw(context) {
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, context.canvas.width, context.canvas.height)
      },
    })
    const blob = await new Promise<Blob>((resolve, reject) =>
      output!.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('浏览器无法生成裁剪图片。'))),
        props.file.type,
        0.95,
      ),
    )
    if (!blob.size || blob.size > 10 * 1024 * 1024)
      throw new Error('裁剪结果超过 10MB，请缩小裁剪区域。')
    if (!disposed)
      emit(
        'selected',
        new File([blob], props.file.name, {
          type: blob.type,
          lastModified: props.file.lastModified,
        }),
      )
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error ? cause.message : '裁剪失败，请重试。'
  } finally {
    if (output) {
      output.width = 0
      output.height = 0
    }
    if (!disposed) exporting.value = false
  }
}
onMounted(async () => {
  let bitmap: ImageBitmap | undefined, normalized: HTMLCanvasElement | undefined
  try {
    if (
      !['image/jpeg', 'image/png'].includes(props.file.type) ||
      !props.file.size ||
      props.file.size > 10 * 1024 * 1024
    )
      throw new Error('请选择不超过 10MB 的 JPEG 或 PNG。')
    bitmap = await createImageBitmap(props.file, { imageOrientation: 'from-image' })
    if (disposed) return
    if (bitmap.width * bitmap.height > 20_000_000) throw new Error('图片不能超过 2000 万像素。')
    normalized = document.createElement('canvas')
    normalized.width = bitmap.width
    normalized.height = bitmap.height
    const context = normalized.getContext('2d')
    if (!context) throw new Error('浏览器暂不支持图片裁剪。')
    context.drawImage(bitmap, 0, 0)
    // Bake EXIF orientation exactly once; the cropper receives an oriented, metadata-free image.
    const blob = await new Promise<Blob>((resolve, reject) =>
      normalized!.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('图片预处理失败。'))),
        'image/png',
      ),
    )
    if (disposed) return
    sourceUrl = URL.createObjectURL(blob)
    sourceImage = new Image()
    sourceImage.src = sourceUrl
    await sourceImage.decode()
    const { default: CropperClass } = await import('cropperjs')
    if (disposed || !host.value) return
    cropper = new CropperClass(sourceImage, {
      container: host.value,
      template: cropperTemplate,
    })
    const image = cropper.getCropperImage()!,
      selection = cropper.getCropperSelection()!
    await image.$ready()
    if (disposed) return
    reset()
    selection.addEventListener('change', (event) => {
      if (!guard) return
      const data = (event as CustomEvent<{ x: number; y: number; width: number; height: number }>)
        .detail
      const canvas = cropper!.getCropperCanvas()!.getBoundingClientRect()
      if (
        !containsCrop(image.getBoundingClientRect(), {
          left: canvas.left + data.x,
          top: canvas.top + data.y,
          width: data.width,
          height: data.height,
        })
      )
        event.preventDefault()
    })
    image.addEventListener('transform', (event) => {
      if (!guard) return
      const next = (event as CustomEvent<{ matrix: number[] }>).detail.matrix
      const bounds = transformedImageBounds(
          image.getBoundingClientRect(),
          image.$getTransform(),
          next,
        ),
        selected = selectionBounds()
      if (!bounds || !selected || !containsCrop(bounds, selected)) event.preventDefault()
    })
    ready.value = true
  } catch (cause) {
    if (!disposed)
      error.value = cause instanceof Error ? cause.message : '图片无法裁剪，请重新选择。'
  } finally {
    bitmap?.close()
    if (normalized) {
      normalized.width = 0
      normalized.height = 0
    }
  }
})
onScopeDispose(() => {
  disposed = true
  guard = false
  cropper?.destroy()
  host.value?.replaceChildren()
  sourceImage?.removeAttribute('src')
  if (sourceUrl) URL.revokeObjectURL(sourceUrl)
})
</script>
<template>
  <AppModal
    class="formula-crop-modal"
    :open="true"
    title="自由裁剪公式图片"
    full-screen
    @close="close"
  >
    <p class="info-note">拖动边框调整区域，双指缩放图片。裁剪不限比例，重新裁剪始终使用原图。</p>
    <div ref="host" class="crop-host" aria-label="公式图片自由裁剪区" />
    <p v-if="!ready && !error" role="status" class="info-note">正在校正图片方向…</p>
    <p v-if="error" role="alert" class="error-text">{{ error }}</p>
    <div class="crop-tools">
      <button
        class="button button-white"
        :disabled="!ready || exporting"
        aria-label="缩小图片"
        @click="zoom(-0.1)"
      >
        缩小
      </button>
      <button
        class="button button-white"
        :disabled="!ready || exporting"
        aria-label="放大图片"
        @click="zoom(0.1)"
      >
        放大
      </button>
      <button class="button button-white" :disabled="!ready || exporting" @click="reset">
        重置裁剪
      </button>
    </div>
    <div class="crop-actions">
      <button class="button button-white" :disabled="exporting" @click="close">取消裁剪</button>
      <button class="button button-primary" :disabled="!ready || exporting" @click="complete">
        {{ exporting ? '正在生成…' : '确认裁剪' }}
      </button>
    </div>
  </AppModal>
</template>
<style scoped>
.formula-crop-modal {
  max-width: 100%;
}
/* Keep every resize hit target inside the clipped canvas, including a full-image crop. */
.crop-host :deep(cropper-handle[action^='n']) {
  top: 0;
}
.crop-host :deep(cropper-handle[action^='s']) {
  bottom: 0;
}
.crop-host :deep(cropper-handle[action^='e']),
.crop-host :deep(cropper-handle[action='ne-resize']),
.crop-host :deep(cropper-handle[action='se-resize']) {
  right: 0;
}
.crop-host :deep(cropper-handle[action^='w']),
.crop-host :deep(cropper-handle[action='nw-resize']),
.crop-host :deep(cropper-handle[action='sw-resize']) {
  left: 0;
}
.crop-host :deep(cropper-handle[action='n-resize']),
.crop-host :deep(cropper-handle[action='s-resize']) {
  height: 24px;
}
.crop-host :deep(cropper-handle[action='e-resize']),
.crop-host :deep(cropper-handle[action='w-resize']) {
  width: 24px;
}
.crop-host :deep(cropper-handle[action='ne-resize']),
.crop-host :deep(cropper-handle[action='nw-resize']),
.crop-host :deep(cropper-handle[action='se-resize']),
.crop-host :deep(cropper-handle[action='sw-resize']) {
  width: 24px;
  height: 24px;
}
.crop-host {
  height: clamp(220px, 48dvh, 440px);
  margin: 18px 0;
  min-width: 0;
  border-radius: var(--radius-control);
  overflow: hidden;
  background: var(--color-background);
}
.crop-host :deep(cropper-canvas) {
  height: 100%;
  width: 100%;
  touch-action: none;
  --theme-color: var(--color-primary);
}
.crop-tools,
.crop-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;
}
.crop-tools .button {
  flex: 1;
  padding: 10px 8px;
}
.crop-actions .button {
  flex: 1;
  min-width: 100px;
  padding: 12px 8px;
}
</style>
