import { defineNuxtConfig } from 'nuxt/config'
import { fileURLToPath } from 'node:url'

// 仅测试启动器通过 --extends 加载，不进入默认生产配置。
export default defineNuxtConfig({
  buildDir: fileURLToPath(new URL('../../tmp/r1-test/nuxt', import.meta.url)),
  vite: {
    server: {
      fs: {
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem}',
          '**/.git/**',
          '**/environment.json',
          '**/compose.env',
        ],
      },
    },
  },
  nitro: {
    handlers: [
      {
        route: '/api/__test/identity',
        handler: fileURLToPath(new URL('./identity-handler.ts', import.meta.url)).replaceAll(
          '\\',
          '/',
        ),
      },
    ],
  },
})
