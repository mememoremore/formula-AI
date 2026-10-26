import type { RecognitionMode } from '#shared/types/api'

/** File 属于当前 Nuxt 实例，不进入 SSR payload、localStorage 或数据库。 */
export default defineNuxtPlugin(() => ({
  provide: {
    uploadDraft: { file: shallowRef<File | null>(null), mode: ref<RecognitionMode>('handwritten') },
  },
}))
