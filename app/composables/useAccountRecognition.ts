import type { RecognitionMode } from '#shared/types/api'
import type { RecognitionTaskState } from '#shared/types/tasks'
import type { UploadedImage } from '#shared/types/workspace'
import type { RecognitionReceipt } from '~/utils/recognition-state'

/** 同一上传/提交沿用请求键；只在收到明确任务响应后释放恢复信息。 */
export function useAccountRecognition(ownerId: Ref<string | undefined>) {
  const draft = useNuxtApp().$uploadDraft
  const stage = ref<'idle' | 'uploading' | 'submitting'>('idle')
  const receipt = computed(() =>
    draft.receipts.value.find((row) => row.ownerId === ownerId.value && !row.sourceTaskId),
  )
  const uncertain = computed(() => !!receipt.value || !!draft.transfer.value?.uncertain)
  let controller: AbortController | undefined,
    disposed = false
  function cancel() {
    controller?.abort()
    controller = undefined
    stage.value = 'idle'
  }
  watch(ownerId, cancel, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    cancel()
  })
  function check(signal: AbortSignal, owner: string) {
    signal.throwIfAborted()
    if (disposed || ownerId.value !== owner) throw new Error('账号或页面已变化')
  }
  async function submit(value: RecognitionReceipt, signal: AbortSignal) {
    draft.putReceipt(value)
    stage.value = 'submitting'
    try {
      const response = await $fetch.raw<RecognitionTaskState>('/api/account/recognitions', {
        method: 'POST',
        body: { fileId: value.fileId, mode: value.mode, requestKey: value.requestKey },
        retry: 0,
        timeout: 30_000,
        signal,
      })
      check(signal, value.ownerId)
      if (response.status !== 202 || !response._data?.id) throw new Error('任务响应尚未确认')
      draft.removeReceipt(value)
      return response._data
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      if (!signal.aborted && [400, 401, 403, 404, 413, 415, 422, 429].includes(status ?? 0))
        draft.removeReceipt(value)
      throw error
    }
  }
  async function recognize(file: File | null, mode: RecognitionMode) {
    const owner = ownerId.value
    if (!owner || controller || disposed) throw new Error('当前不能提交')
    draft.requireRecovery()
    const active = new AbortController()
    controller = active
    try {
      if (receipt.value) return await submit(receipt.value, active.signal)
      if (!file) throw new Error('请重新选择图片')
      if (draft.transfer.value?.file !== file || draft.transfer.value.ownerId !== owner)
        draft.transfer.value = {
          file,
          ownerId: owner,
          key: crypto.randomUUID(),
          image: null,
          uncertain: false,
        }
      const transfer = draft.transfer.value!
      if (!transfer.image) {
        stage.value = 'uploading'
        transfer.uncertain = true
        triggerRef(draft.transfer)
        try {
          const result = await $fetch<{ image: UploadedImage }>('/api/account/files', {
            method: 'POST',
            body: file,
            signal: active.signal,
            timeout: 60_000,
            retry: 0,
            headers: {
              'content-type': file.type,
              'x-file-name': encodeURIComponent(file.name),
              'x-upload-key': transfer.key,
            },
          })
          check(active.signal, owner)
          transfer.image = result.image
          transfer.uncertain = false
          triggerRef(draft.transfer)
        } catch (error) {
          if (
            [400, 401, 403, 404, 413, 415, 422, 429].includes(
              (error as { statusCode?: number }).statusCode ?? 0,
            )
          ) {
            transfer.uncertain = false
            triggerRef(draft.transfer)
          }
          throw error
        }
      }
      return await submit(
        { ownerId: owner, fileId: transfer.image.id, mode, requestKey: crypto.randomUUID() },
        active.signal,
      )
    } finally {
      if (controller === active) {
        controller = undefined
        stage.value = 'idle'
      }
    }
  }
  function retryReceipt(taskId: string) {
    return draft.receipts.value.find(
      (row) => row.ownerId === ownerId.value && row.sourceTaskId === taskId,
    )
  }
  async function retry(task: RecognitionTaskState) {
    const owner = ownerId.value
    if (!owner || controller || disposed || task.status !== 'FAILED')
      throw new Error('当前不能重试')
    draft.requireRecovery()
    const active = new AbortController()
    controller = active
    try {
      return await submit(
        retryReceipt(task.id) ?? {
          ownerId: owner,
          fileId: task.fileId,
          mode: task.mode,
          requestKey: crypto.randomUUID(),
          sourceTaskId: task.id,
        },
        active.signal,
      )
    } finally {
      if (controller === active) {
        controller = undefined
        stage.value = 'idle'
      }
    }
  }
  return {
    stage,
    receipt,
    uncertain,
    recognize,
    retry,
    retryReceipt,
    cancel,
    recoveryReady: draft.recoveryReady,
  }
}
