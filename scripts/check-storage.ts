import 'dotenv/config'
import { createObjectStore } from '../server/storage/object-store'

const store = createObjectStore({
  endpoint: process.env.NUXT_STORAGE_ENDPOINT ?? '',
  region: process.env.NUXT_STORAGE_REGION ?? 'us-east-1',
  bucket: process.env.NUXT_STORAGE_BUCKET ?? '',
  accessKeyId: process.env.NUXT_STORAGE_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.NUXT_STORAGE_SECRET_ACCESS_KEY ?? '',
})
try {
  await store.check()
  console.log('私有对象存储已连接，签名请求可访问指定存储桶。')
} catch {
  console.error('对象存储检查失败，请检查容器、配置和存储桶。未输出私有凭据。')
  process.exitCode = 1
}
