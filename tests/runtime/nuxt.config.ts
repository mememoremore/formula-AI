import { defineNuxtConfig } from 'nuxt/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { loadTestManifest } from '../support/test-runtime'

// Launcher and preload already validate resource variables. Nuxt adds internal NUXT_* flags.
loadTestManifest({ FORMULA_TEST_MANIFEST: process.env.FORMULA_TEST_MANIFEST })

// 仅测试启动器通过 --extends 加载，不进入默认生产配置。
export default defineNuxtConfig({
  buildDir: resolve(dirname(process.env.FORMULA_TEST_MANIFEST!), 'nuxt'),
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
