import { createObjectStore, type PrivateObjectStore } from '../storage/object-store'
const processState = globalThis as typeof globalThis & { formulaObjectStore?: PrivateObjectStore }
export function getObjectStore() {
  const config = useRuntimeConfig()
  if (
    !config.storageEndpoint ||
    !config.storageBucket ||
    !config.storageAccessKeyId ||
    !config.storageSecretAccessKey
  )
    throw createError({ statusCode: 503, message: '图片存储暂时不可用，请稍后重试。' })
  processState.formulaObjectStore ??= createObjectStore({
    endpoint: config.storageEndpoint,
    region: config.storageRegion,
    bucket: config.storageBucket,
    accessKeyId: config.storageAccessKeyId,
    secretAccessKey: config.storageSecretAccessKey,
  })
  return processState.formulaObjectStore
}
