export interface UploadPreview {
  url: string
  name: string
  size: number
  mimeType: 'image/jpeg' | 'image/png'
  formulaId?: string
}

/** Object URLs live for this browser session and are never written to localStorage. */
export function useUploadPreview() {
  const preview = useState<UploadPreview | null>('upload-preview', () => null)
  function replacePreview(value: UploadPreview | null) {
    if (preview.value?.url) URL.revokeObjectURL(preview.value.url)
    preview.value = value
  }
  function attachFormula(id: string) {
    if (preview.value) preview.value.formulaId = id
  }
  return { preview, replacePreview, attachFormula }
}
