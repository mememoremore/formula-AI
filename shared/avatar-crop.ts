/** 裁剪窗口必须始终被图片覆盖；拖动边界随缩放实时收敛。 */
export function avatarCrop(
  width: number,
  height: number,
  zoom: number,
  x: number,
  y: number,
  size = 320,
) {
  const scale = Math.max(size / width, size / height) * Math.min(3, Math.max(1, zoom))
  const w = width * scale,
    h = height * scale
  const dx = Math.max(-(w - size) / 2, Math.min((w - size) / 2, x))
  const dy = Math.max(-(h - size) / 2, Math.min((h - size) / 2, y))
  return {
    x: (size - w) / 2 + dx,
    y: (size - h) / 2 + dy,
    width: w,
    height: h,
    offsetX: dx,
    offsetY: dy,
  }
}
