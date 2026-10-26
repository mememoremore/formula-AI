export type ServiceState = 'ready' | 'unavailable' | 'configured' | 'demo'
export interface ServiceStatusResponse {
  checkedAt: string
  items: { id: string; name: string; state: ServiceState; detail: string }[]
}
