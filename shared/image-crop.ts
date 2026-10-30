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
/** Calculate the screen bounds after a translation, scale, or right-angle rotation. */
export function transformedImageBounds(
  rect: CropBounds,
  current: number[],
  next: number[],
): CropBounds | null {
  if (current.length !== 6 || next.length !== 6 || ![...current, ...next].every(Number.isFinite))
    return null
  const [a, b, c, d] = current,
    [nextA, nextB, nextC, nextD] = next,
    determinant = a! * d! - b! * c!,
    nextDeterminant = nextA! * nextD! - nextB! * nextC!
  if (determinant <= 0 || nextDeterminant <= 0) return null
  const tolerance = 1e-6
  if (
    Math.abs(a! * c! + b! * d!) > tolerance ||
    Math.abs(nextA! * nextC! + nextB! * nextD!) > tolerance
  )
    return null
  const x1 = Math.abs(a!),
    x2 = Math.abs(c!),
    y1 = Math.abs(b!),
    y2 = Math.abs(d!),
    absoluteDeterminant = x1 * y2 - x2 * y1
  if (Math.abs(absoluteDeterminant) <= tolerance) return null
  const sourceWidth = (rect.width * y2 - x2 * rect.height) / absoluteDeterminant,
    sourceHeight = (x1 * rect.height - rect.width * y1) / absoluteDeterminant
  if (sourceWidth <= 0 || sourceHeight <= 0) return null
  const width = Math.abs(nextA!) * sourceWidth + Math.abs(nextC!) * sourceHeight,
    height = Math.abs(nextB!) * sourceWidth + Math.abs(nextD!) * sourceHeight
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
