import { defineNuxtConfig } from 'nuxt/config'
import { fileURLToPath } from 'node:url'

// 显式 --extends 才加入预览页面；正常生产构建不加载此层。
export default defineNuxtConfig({
  buildDir: fileURLToPath(new URL('../../tmp/r2-preview/nuxt', import.meta.url)),
  nitro: {
    handlers: [
      {
        middleware: true,
        handler: fileURLToPath(new URL('./session-middleware.ts', import.meta.url)).replaceAll(
          '\\',
          '/',
        ),
      },
    ],
  },
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
})
