import { useRuntimeConfig } from 'nitropack/runtime'
import { eventHandler, getHeader, createError, setHeader } from 'h3'
import { timingSafeEqual } from 'node:crypto'
import { loadTestManifest } from '../support/test-runtime'
import { environmentFingerprint, testVariables } from '../support/test-environment'

export default eventHandler((event) => {
  const config = loadTestManifest({ FORMULA_TEST_MANIFEST: process.env.FORMULA_TEST_MANIFEST })
  const token = Buffer.from(getHeader(event, 'x-formula-test-token') ?? '')
  const expected = Buffer.from(config.token)
  if (token.length !== expected.length || !timingSafeEqual(token, expected))
    throw createError({ statusCode: 404 })
  const actual = useRuntimeConfig(event)
  for (const [key, value] of Object.entries(testVariables(config))) {
    if (!key.startsWith('NUXT_') || key === 'NUXT_TELEMETRY_DISABLED') continue
    const name = key
      .slice(5)
      .toLowerCase()
      .replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
    if (actual[name] !== value)
      throw createError({ statusCode: 503, message: `测试 API 配置身份不一致：${key}` })
  }
  setHeader(event, 'Cache-Control', 'no-store')
  return {
    runId: config.runId,
    fingerprint: environmentFingerprint(config),
    providers: { chat: 'mock', recognition: 'mock' },
  }
})
