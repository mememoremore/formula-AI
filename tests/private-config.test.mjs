import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { sourceFingerprint, publicBuildFiles } from './support/build-receipt.ts'

test('当前源码的成功隔离构建不得把私有配置写入客户端产物', async () => {
  const file = process.env.FORMULA_TEST_BUILD_RECEIPT
  assert.equal(
    file,
    resolve('tmp/r1-test/client-build-receipt.json'),
    '必须运行 npm run check:build，不读取开发 .env 或旧 .output',
  )
  const receipt = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(receipt.status, 'completed', '本次隔离构建必须成功；失败或进行中的产物不能验收')
  assert.equal(receipt.fingerprint, sourceFingerprint(), '源码变化后必须重新构建')
  assert.equal(receipt.output, resolve('tmp/r1-test/build/public'))
  assert.ok(Array.isArray(receipt.markers) && receipt.markers.length >= 8)
  const files = publicBuildFiles(receipt.output)
  assert.ok(files.length > 0, '客户端产物不能为空')
  assert.deepEqual(files, receipt.files, '产物必须对应已完成构建的校验清单')
  for (const entry of files) {
    if (!/\.(?:js|mjs|json|html|css|txt)$/.test(entry.path)) continue
    const text = await readFile(resolve(receipt.output, entry.path), 'utf8')
    assert.equal(
      receipt.markers.some((marker) => text.includes(marker)),
      false,
      `发现私有配置进入客户端：${entry.path}`,
    )
  }
})
