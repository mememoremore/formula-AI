import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { test } from 'node:test'

test('数据库、认证与私有对象存储配置不得进入生产客户端产物', async (t) => {
  const connectionString = process.env.NUXT_DATABASE_URL
  if (!connectionString) {
    t.skip('未配置本机数据库连接，跳过凭据扫描。')
    return
  }
  const password = decodeURIComponent(new URL(connectionString).password)
  const secrets = [
    connectionString,
    password,
    process.env.NUXT_AUTH_SECRET,
    process.env.NUXT_AI_API_KEY,
    process.env.NUXT_RECOGNITION_API_KEY,
    'formula-ai-private-ai-check-day13',
    process.env.NUXT_STORAGE_ACCESS_KEY_ID,
    process.env.NUXT_STORAGE_SECRET_ACCESS_KEY,
    process.env.NUXT_STORAGE_ENDPOINT,
  ].filter(Boolean)
  const root = join(process.cwd(), '.output/public')

  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await inspect(path)
      else if (/\.(?:js|mjs|json|html|css|txt)$/.test(entry.name)) {
        const text = await readFile(path, 'utf8')
        // 失败信息只打印文件名，不将真实凭据写入终端。
        assert.equal(
          secrets.some((secret) => text.includes(secret)),
          false,
          `发现私有配置泄漏：${relative(root, path)}`,
        )
      }
    }
  }
  await inspect(root)
})
