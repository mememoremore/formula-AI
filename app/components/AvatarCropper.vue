<script setup lang="ts">
import { avatarCrop } from '#shared/avatar-crop'
const props = defineProps<{ file: File }>()
const emit = defineEmits<{ close: []; selected: [dataUrl: string] }>()
const canvas = ref<HTMLCanvasElement>()
const zoom = ref(1)
const x = ref(0),
  y = ref(0)
const error = ref('')
const ready = ref(false)
let bitmap: ImageBitmap | undefined
let disposed = false
let pointer: { id: number; x: number; y: number } | undefined
function draw() {
  if (!bitmap || !canvas.value) return
  const crop = avatarCrop(bitmap.width, bitmap.height, zoom.value, x.value, y.value)
  x.value = crop.offsetX
  y.value = crop.offsetY
  const ctx = canvas.value.getContext('2d')
  ctx?.clearRect(0, 0, 320, 320)
  ctx?.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height)
}
function nudge(dx: number, dy: number) {
  x.value += dx
  y.value += dy
  draw()
}
watch(zoom, draw)
function start(event: PointerEvent) {
  if (!ready.value || !canvas.value) return
  canvas.value.setPointerCapture(event.pointerId)
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
}
function move(event: PointerEvent) {
  if (!pointer || !canvas.value || pointer.id !== event.pointerId) return
  const ratio = 320 / canvas.value.getBoundingClientRect().width
  x.value += (event.clientX - pointer.x) * ratio
  y.value += (event.clientY - pointer.y) * ratio
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
  draw()
}
function complete() {
  if (!bitmap || !ready.value) return
  const output = document.createElement('canvas')
  output.width = 512
  output.height = 512
  const crop = avatarCrop(bitmap.width, bitmap.height, zoom.value, x.value, y.value, 320)
  const ctx = output.getContext('2d')
  if (!ctx) {
    error.value = '浏览器暂时无法裁剪图片。'
    return
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 512, 512)
  ctx.drawImage(bitmap, crop.x * 1.6, crop.y * 1.6, crop.width * 1.6, crop.height * 1.6)
  emit('selected', output.toDataURL('image/jpeg', 0.9))
}
onMounted(async () => {
  try {
    if (
      !['image/jpeg', 'image/png'].includes(props.file.type) ||
      props.file.size > 10 * 1024 * 1024
    )
      throw new Error('请选择不超过 10MB 的 JPG 或 PNG。')
    const loaded = await createImageBitmap(props.file, { imageOrientation: 'from-image' })
    if (disposed) {
      loaded.close()
      return
    }
    bitmap = loaded
    if (bitmap.width * bitmap.height > 20_000_000) throw new Error('图片不能超过 2000 万像素。')
    ready.value = true
    draw()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '图片无法读取，请重新选择。'
  }
})
onScopeDispose(() => {
  disposed = true
  bitmap?.close()
})
</script>
<template>
  <AppModal :open="true" title="裁剪头像" full-screen @close="emit('close')">
    <p class="info-note">拖动调整位置，滑动缩放。保存时保留方形图片，头像以圆形展示。</p>
    <div class="crop-preview">
      <canvas
        ref="canvas"
        width="320"
        height="320"
        aria-label="头像裁剪预览，可拖动调整"
        @pointerdown="start"
        @pointermove="move"
        @pointerup="pointer = undefined"
        @pointercancel="pointer = undefined"
      />
    </div>
    <label class="field-label" for="avatar-zoom">缩放</label>
    <input
      id="avatar-zoom"
      v-model.number="zoom"
      type="range"
      min="1"
      max="3"
      step=".01"
      :disabled="!ready"
      class="zoom"
    />
    <div class="crop-position" aria-label="键盘调整裁剪位置">
      <button type="button" :disabled="!ready" @click="nudge(-10, 0)">← 左移</button>
      <button type="button" :disabled="!ready" @click="nudge(10, 0)">右移 →</button>
      <button type="button" :disabled="!ready" @click="nudge(0, -10)">上移</button>
      <button type="button" :disabled="!ready" @click="nudge(0, 10)">下移</button>
    </div>
    <p v-if="error" class="error-text section" role="alert">{{ error }}</p>
    <div class="row section">
      <button class="button button-white" @click="emit('close')">取消</button>
      <button class="button button-primary" :disabled="!ready || !!error" @click="complete">
        使用此头像
      </button>
    </div>
  </AppModal>
</template>
<style scoped>
.crop-preview {
  position: relative;
  margin: 24px 0;
  border-radius: 16px;
  overflow: hidden;
  background: #ede9f4;
}
canvas {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  touch-action: none;
  cursor: grab;
}
.crop-preview::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 90px #25203466;
  border: 2px solid #fff;
  pointer-events: none;
}
.zoom {
  width: 100%;
  accent-color: var(--color-primary);
}
.crop-position {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.crop-position button {
  background: #f0ecf9;
  border: 0;
  color: #8a79a6;
  padding: 7px;
  border-radius: 7px;
  font-size: 11px;
}
</style>
