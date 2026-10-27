import type { RecognitionMode } from '#shared/types/api'
import type { UploadedImage } from '#shared/types/workspace'
import {
  parseRecognitionReceipts,
  receiptIdentity,
  RECOGNITION_RECOVERY_KEY,
  type RecognitionReceipt,
} from '~/utils/recognition-state'

/** File 属于当前 Nuxt 实例，不进入 SSR payload、localStorage 或数据库。 */
export default defineNuxtPlugin(() => {
  const file = shallowRef<File | null>(null),
    mode = ref<RecognitionMode>('handwritten'),
    ownerId = ref<string | null>(null)
  const transfer = shallowRef<{
    file: File
    ownerId: string
    key: string
    image: UploadedImage | null
    uncertain: boolean
  } | null>(null)
  const receipts = shallowRef<RecognitionReceipt[]>([]),
    recoveryWarning = ref('')
  let initialized = import.meta.server
  let confirmedOwner: string | null | undefined
  function persist() {
    if (import.meta.server) return true
    try {
      sessionStorage.setItem(RECOGNITION_RECOVERY_KEY, JSON.stringify(receipts.value))
      recoveryWarning.value = ''
      return true
    } catch {
      recoveryWarning.value = '恢复信息暂时无法保存，请先确认任务结果再刷新。'
      return false
    }
  }
  function putReceipt(value: RecognitionReceipt) {
    const rows = receipts.value.filter((row) => receiptIdentity(row) !== receiptIdentity(value))
    if (rows.length >= 20)
      throw createError({
        statusCode: 400,
        data: { message: '待确认请求已达上限，请先到最近识别核对已有任务。' },
      })
    receipts.value = [...rows, value]
    if (!persist()) {
      recoveryWarning.value = '恢复凭据无法保存，本次任务请求未发送。请允许会话存储后重试。'
      throw createError({ statusCode: 400, data: { message: recoveryWarning.value } })
    }
  }
  function removeReceipt(value: RecognitionReceipt) {
    receipts.value = receipts.value.filter((row) => receiptIdentity(row) !== receiptIdentity(value))
    persist()
  }
  function confirmOwner(id: string | null) {
    confirmedOwner = id
    if (ownerId.value && ownerId.value !== id) {
      file.value = null
      mode.value = 'handwritten'
      ownerId.value = null
      useUploadPreview().replacePreview(null)
    }
    if (initialized) {
      receipts.value = receipts.value.filter((row) => row.ownerId === id)
      persist()
    }
  }
  function clearAccountState() {
    confirmedOwner = null
    file.value = null
    mode.value = 'handwritten'
    ownerId.value = null
    receipts.value = []
    useUploadPreview().replacePreview(null)
    if (initialized) persist()
  }
  watch(
    file,
    () => {
      transfer.value = null
    },
    { flush: 'sync' },
  )
  if (import.meta.client)
    onNuxtReady(() => {
      try {
        receipts.value = parseRecognitionReceipts(sessionStorage.getItem(RECOGNITION_RECOVERY_KEY))
      } catch {
        recoveryWarning.value = '恢复信息暂时无法读取，请到最近识别中核对。'
      }
      initialized = true
      if (confirmedOwner !== undefined) confirmOwner(confirmedOwner)
    })
  return {
    provide: {
      uploadDraft: {
        file,
        mode,
        ownerId,
        transfer,
        receipts,
        recoveryWarning,
        putReceipt,
        removeReceipt,
        confirmOwner,
        clearAccountState,
      },
    },
  }
})
