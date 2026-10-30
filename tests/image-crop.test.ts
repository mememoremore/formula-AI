import assert from 'node:assert/strict'
import { test } from 'node:test'
import { containsCrop, cropOutputSize, transformedImageBounds } from '../shared/image-crop'
const image = { left: 10, top: 20, width: 300, height: 200 }
test('自由矩形保留非方形的原始像素分辨率', () => {
  assert.deepEqual(
    cropOutputSize(3000, 2000, image, { left: 40, top: 60, width: 120, height: 60 }),
    { width: 1200, height: 600 },
  )
})
test('裁剪边界拒绝越界、空框和非有限坐标', () => {
  for (const value of [
    { left: 0, top: 20, width: 10, height: 10 },
    { left: 10, top: 20, width: 0, height: 2 },
    { left: 10, top: 20, width: NaN, height: 2 },
  ]) {
    assert.equal(containsCrop(image, value), false)
    assert.throws(() => cropOutputSize(300, 200, image, value))
  }
})
test('图片平移缩放后边界使用中心变换，不混用屏幕与原图坐标', () => {
  assert.deepEqual(transformedImageBounds(image, [1, 0, 0, 1, 0, 0], [2, 0, 0, 2, 5, 7]), {
    left: -135,
    top: -73,
    width: 600,
    height: 400,
  })
  assert.equal(transformedImageBounds(image, [1, 0, 0, 1, 0, 0], [-1, 0, 0, 1, 0, 0]), null)
})
test('支持直角旋转并拒绝倾斜，像素上限不能绕过', () => {
  assert.deepEqual(transformedImageBounds(image, [1, 0, 0, 1, 0, 0], [0, 1, -1, 0, 0, 0]), {
    left: 60,
    top: -30,
    width: 200,
    height: 300,
  })
  assert.equal(transformedImageBounds(image, [1, 0, 0, 1, 0, 0], [1, 0.2, 0, 1, 0, 0]), null)
  assert.throws(() => cropOutputSize(10000, 10000, image, image))
  assert.deepEqual(cropOutputSize(3, 2, image, image), { width: 3, height: 2 })
})

test('430px完整图片的亚像素框保留原始分辨率，不分别取整坐标', () => {
  const bounds = { left: 24, top: 108.5625, width: 382, height: 214.875 }
  assert.deepEqual(cropOutputSize(320, 180, bounds, bounds), { width: 320, height: 180 })
})
