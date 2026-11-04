import { test, expect } from 'vitest'
import { Socket } from 'node:net'

test('Vitest workers do not inherit service credentials or root dotenv', () => {
  expect(process.env.NUXT_DATABASE_URL).toBeUndefined()
  expect(process.env.NUXT_AI_API_KEY).toBeUndefined()
  expect(process.env.FORMULA_SMTP_PASSWORD).toBeUndefined()
  expect(process.env.DOTENV_CONFIG_PATH?.replaceAll('\\', '/')).toMatch(
    /tests\/support\/empty.env$/,
  )
})

test('Vitest refuses live providers and development database/storage before connecting', () => {
  for (const target of [
    { host: 'api.deepseek.com', port: 443 },
    { host: '127.0.0.1', port: 5432 },
    { host: '127.0.0.1', port: 8333 },
  ]) {
    const socket = new Socket()
    expect(() => socket.connect(target)).toThrow('测试网络策略')
    expect(socket.connecting).toBe(false)
    socket.destroy()
  }
})
