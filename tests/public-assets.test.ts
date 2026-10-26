import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publicAssetReferences } from './support/public-assets.ts'

test('识别模板及 CSS 本地素材，去重并剥离查询参数', () => {
  assert.deepEqual(
    publicAssetReferences(
      '<img src="/images/a.webp?v=1"><img src="/images/a.webp"><style>x{background:url(\'/icons/b.svg#x\')}</style>',
    ),
    ['/icons/b.svg', '/images/a.webp'],
  )
})
test('不将路由、API、外部图片或动态地址当成本地静态素材', () => {
  assert.deepEqual(
    publicAssetReferences(
      '<a href="/profile"><img src="/api/avatar/image.png"><img src="//cdn.test/a.png"><img src="https://cdn.test/a.png"><img :src="`/images/${name}.png`">',
    ),
    [],
  )
})
