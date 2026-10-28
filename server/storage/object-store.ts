import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'

export interface StorageConfiguration {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}
export interface PrivateObjectStore {
  bucket: string
  put(key: string, data: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<Buffer>
  remove(key: string): Promise<void>
  check(): Promise<void>
  head?(key: string): Promise<{ size: number; modifiedAt: Date } | null>
  list?(
    cursor?: string,
  ): Promise<{ objects: { key: string; size: number; modifiedAt: Date }[]; cursor?: string }>
}

/** 业务只依赖此接口；更换 S3 兼容服务无需改图片与公式代码。 */
export function createObjectStore(config: StorageConfiguration): PrivateObjectStore {
  if (!config.endpoint || !config.bucket || !config.accessKeyId || !config.secretAccessKey)
    throw new Error('私有存储尚未配置。')
  const endpoint = new URL(config.endpoint)
  if (
    endpoint.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
  )
    throw new Error('非本机对象存储必须使用 HTTPS。')
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 3000, requestTimeout: 15000 },
  })
  return {
    bucket: config.bucket,
    async head(key) {
      try {
        const value = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }))
        if (value.ContentLength === undefined || !value.LastModified)
          throw new Error('Incomplete object metadata')
        return { size: value.ContentLength, modifiedAt: value.LastModified }
      } catch (error) {
        if (
          error instanceof Error &&
          '$metadata' in error &&
          (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404
        )
          return null
        throw error
      }
    },
    async list(cursor) {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          ContinuationToken: cursor,
          MaxKeys: 500,
        }),
      )
      if (
        page.IsTruncated &&
        (!page.NextContinuationToken || page.NextContinuationToken === cursor)
      )
        throw new Error('Invalid inventory cursor')
      const objects = (page.Contents ?? []).map((object) => {
        if (!object.Key || object.Size === undefined || !object.LastModified)
          throw new Error('Incomplete object inventory')
        return { key: object.Key, size: object.Size, modifiedAt: object.LastModified }
      })
      return { objects, cursor: page.IsTruncated ? page.NextContinuationToken : undefined }
    },
    async put(key, data, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
        }),
      )
    },
    async get(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
      if (!result.Body) throw new Error('存储对象没有内容。')
      return Buffer.from(await result.Body.transformToByteArray())
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
    },
    async check() {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }))
    },
  }
}
