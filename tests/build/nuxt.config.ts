import { defineNuxtConfig } from 'nuxt/config'
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  buildDir: fileURLToPath(new URL('../../tmp/r1-test/build-nuxt', import.meta.url)),
  nitro: { output: { dir: fileURLToPath(new URL('../../tmp/r1-test/build', import.meta.url)) } },
})
