import type { RecognitionMode } from '#shared/types/api'
import type { UploadedImage } from '#shared/types/workspace'
import type { RecognitionTaskState } from '#shared/types/tasks'

/** 上传成功后复用 fileId；失败重试沿用请求键，不重复保存文件或公式。 */
export function useAccountRecognition() {
  const stage = ref<'idle' | 'uploading' | 'recognizing'>('idle')
  let currentFile: File | null = null
  let currentOwner = ''
  let uploaded: UploadedImage | null = null
  let uploadKey = ''
  let recognitionKey = ''
  let recognitionMode: RecognitionMode | null = null

  async function recognize(file: File, ownerId: string, mode: RecognitionMode) {
    if (currentFile !== file || currentOwner !== ownerId) {
      currentFile = file
      currentOwner = ownerId
      uploaded = null
      uploadKey = crypto.randomUUID()
      recognitionKey = ''
    }
    if (!recognitionKey || recognitionMode !== mode) {
      recognitionKey = crypto.randomUUID()
      recognitionMode = mode
    }
    try {
      if (!uploaded) {
        stage.value = 'uploading'
        const result = await $fetch<{ image: UploadedImage }>('/api/account/files', {
          method: 'POST',
          body: file,
          timeout: 60_000,
          retry: 0,
          headers: {
            'content-type': file.type,
            'x-file-name': encodeURIComponent(file.name),
            'x-upload-key': uploadKey,
          },
        })
        uploaded = result.image
      }
      stage.value = 'recognizing'
      return await $fetch<RecognitionTaskState>('/api/account/recognitions', {
        method: 'POST',
        body: { fileId: uploaded.id, mode, requestKey: recognitionKey },
        retry: 0,
        timeout: 30_000,
      })
    } finally {
      stage.value = 'idle'
    }
  }
  return { stage, recognize }
}
