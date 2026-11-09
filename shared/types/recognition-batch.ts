export interface RecognitionBatchView {
  id: string
  mode: 'single' | 'multiple'
  status: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'
  createdAt: string
  errorMessage: string | null
  total: number
  completed: number
  failed: number
  stopped?: number
  images: {
    id: string
    fileId: string
    name: string
    position: number
    parts: {
      id: string
      position: number
      fileId: string
      taskId: string | null
      status: 'WAITING' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
      errorMessage: string | null
      formula: { id: string; title: string; latex: string; versionId: string } | null
    }[]
  }[]
}
