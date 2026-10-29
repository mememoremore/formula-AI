export interface CropBounds {
  left: number
  top: number
  width: number
  height: number
}
export function containsCrop(image: CropBounds, selection: CropBounds) {
  return (
    [
      image.left,
      image.top,
      image.width,
      image.height,
      selection.left,
      selection.top,
      selection.width,
      selection.height,
    ].every(Number.isFinite) &&
    selection.width > 0 &&
    selection.height > 0 &&
    selection.left >= image.left - 0.5 &&
    selection.top >= image.top - 0.5 &&
    selection.left + selection.width <= image.left + image.width + 0.5 &&
    selection.top + selection.height <= image.top + image.height + 0.5
  )
}
/** Only translation and positive, axis-aligned scaling are enabled in the cropper. */
export function transformedImageBounds(
  rect: CropBounds,
  current: number[],
  next: number[],
): CropBounds | null {
  if (
    current.length !== 6 ||
    next.length !== 6 ||
    !next.every(Number.isFinite) ||
    next[0]! <= 0 ||
    next[3]! <= 0 ||
    next[1] !== 0 ||
    next[2] !== 0 ||
    current[0]! <= 0 ||
    current[3]! <= 0
  )
    return null
  const width = (rect.width * next[0]!) / current[0]!,
    height = (rect.height * next[3]!) / current[3]!
  return {
    left: rect.left + (rect.width - width) / 2 + next[4]! - current[4]!,
    top: rect.top + (rect.height - height) / 2 + next[5]! - current[5]!,
    width,
    height,
  }
}
export function cropOutputSize(
  naturalWidth: number,
  naturalHeight: number,
  image: CropBounds,
  selection: CropBounds,
) {
  if (!containsCrop(image, selection) || image.width <= 0 || image.height <= 0)
    throw new Error('裁剪框需要位于图片内部。')
  const width = Math.min(
    naturalWidth,
    Math.max(1, Math.round((selection.width / image.width) * naturalWidth)),
  )
  const height = Math.min(
    naturalHeight,
    Math.max(1, Math.round((selection.height / image.height) * naturalHeight)),
  )
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width * height > 20_000_000)
    throw new Error('裁剪图片不能超过 2000 万像素。')
  return { width, height }
}
