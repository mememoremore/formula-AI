import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'

type Operation =
  | 'account'
  | 'upload'
  | 'profile'
  | 'recognition'
  | 'chat'
  | 'export'
  | 'lease-recovery'
  | 'task-recovery'
export interface DiagnosticFields {
  stage?: 'request' | 'attempt' | 'prepared' | 'finished' | 'audit' | 'reconcile' | 'storage-check'
  operation?: Operation
  ownerId?: string
  requestId?: string
  taskId?: string
  jobId?: string
  callId?: string
  leaseId?: string
  fileId?: string
  resourceId?: string
  auditId?: string
  operationId?: string
  requestKey?: string
  attempt?: number
  status?: number
  reviewed?: number
  durationMs?: number
  code?: string
  auditAction?: string
  auditOutcome?: string
  outcome?:
    | 'started'
    | 'returned'
    | 'committed'
    | 'retrying'
    | 'failed'
    | 'unconfirmed'
    | 'recorded'
    | 'observed'
    | 'review-required'
}
const context = new AsyncLocalStorage<DiagnosticFields>()
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const operations = new Set([
  'account',
  'upload',
  'profile',
  'recognition',
  'chat',
  'export',
  'lease-recovery',
  'task-recovery',
])
const outcomes = new Set([
  'started',
  'returned',
  'committed',
  'retrying',
  'failed',
  'unconfirmed',
  'recorded',
  'observed',
  'review-required',
])
const codes = new Set([
  'UNCLASSIFIED',
  'REQUEST_REJECTED',
  'STORAGE_CAPACITY',
  'UPLOAD_BUSY',
  'UPLOAD_RATE',
  'RECOGNITION_BUSY',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'INVALID_INPUT',
  'INVALID_OUTPUT',
  'CONFIGURATION',
  'TIMEOUT',
  'UPSTREAM',
  'P1001',
  'P1002',
  'P2002',
  'P2003',
  'P2021',
  'P2022',
  'P2024',
  'P2025',
  'P2034',
  'LOST_CLAIM',
  'STORAGE_UNAVAILABLE',
  'LEASE_RECONCILIATION_FAILED',
  'WORKER_START_FAILED',
  'WORKER_STOP_FAILED',
  'QUEUE_UNAVAILABLE',
  'TASK_RECONCILIATION_FAILED',
  'TASK_RECONCILIATION_UNRESOLVED',
  'CALL_OUTCOME_UNKNOWN',
])
type Event =
  | 'http.operation'
  | 'worker.attempt'
  | 'chat.call'
  | 'resource.lease'
  | 'resource.file'
  | 'storage.audit'
  | 'lease.recovery'
  | 'task.recovery'
  | 'worker.lifecycle'
  | 'queue.connection'
export function withDiagnostics<T>(
  fields: DiagnosticFields,
  action: () => T,
  options: { inheritContext?: boolean } = {},
): T {
  return context.run(
    { ...(options.inheritContext === false ? undefined : context.getStore()), ...fields },
    action,
  )
}
export function identifyDiagnosticAccount(ownerId: string) {
  const current = context.getStore()
  if (current) current.ownerId = ownerId
}
export function safeDiagnosticCode(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    codes.has(error.code)
  )
    return error.code
  if (
    error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  )
    return 'REQUEST_REJECTED'
  return 'UNCLASSIFIED'
}
/** 白名单构造输出；不序列化error、请求、Prompt、对象key或调用方额外字段。 */
export function diagnostic(
  event: Event,
  fields: DiagnosticFields = {},
  options: { inheritContext?: boolean } = {},
) {
  const value = {
    ...(options.inheritContext === false ? undefined : context.getStore()),
    ...fields,
  }
  const entry: Record<string, string | number> = { event }
  for (const key of [
    'requestId',
    'taskId',
    'jobId',
    'callId',
    'leaseId',
    'fileId',
    'resourceId',
    'auditId',
    'operationId',
    'requestKey',
  ] as const)
    if (typeof value[key] === 'string' && uuid.test(value[key])) entry[key] = value[key]
  if (typeof value.ownerId === 'string' && uuid.test(value.ownerId))
    entry.ownerRef = createHash('sha256').update(value.ownerId).digest('hex').slice(0, 16)
  for (const key of ['attempt', 'status', 'reviewed', 'durationMs'] as const)
    if (Number.isSafeInteger(value[key]) && value[key]! >= 0) entry[key] = value[key]!
  if (
    value.stage &&
    ['request', 'attempt', 'prepared', 'finished', 'audit', 'reconcile', 'storage-check'].includes(
      value.stage,
    )
  )
    entry.stage = value.stage
  if (value.operation && operations.has(value.operation)) entry.operation = value.operation
  if (value.outcome && outcomes.has(value.outcome)) entry.outcome = value.outcome
  if (value.code && codes.has(value.code)) entry.code = value.code
  if (
    value.auditAction &&
    ['LEASE_REVOKE', 'AVATAR_RETIRE', 'WRITE_RECONCILE', 'COMPENSATE', 'DELETE'].includes(
      value.auditAction,
    )
  )
    entry.auditAction = value.auditAction
  if (value.auditOutcome && ['STARTED', 'REVIEW_REQUIRED', 'DELETED'].includes(value.auditOutcome))
    entry.auditOutcome = value.auditOutcome
  try {
    console.info(JSON.stringify(entry))
  } catch {
    /* 日志输出失败不能改变已提交的业务结果。 */
  }
}
