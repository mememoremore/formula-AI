import { loadTestManifest, inspectTestContainers } from './test-runtime.ts'
import { testVariables } from './test-environment.ts'
import { installTestNetworkGuard } from './network-guard.ts'

// --import 在 Nuxt 入口之前执行；允许构建内部回环通信，拒绝公网和开发默认端口。
// 启动器已检查完整调用环境。Nuxt 内部 Worker 会新增自己的 NUXT_* 标志；
// 此处检查所有资源变量，实际 runtimeConfig 还必须通过身份插件再次核对。
const config = loadTestManifest({ FORMULA_TEST_MANIFEST: process.env.FORMULA_TEST_MANIFEST })
for (const [key, value] of Object.entries(testVariables(config)))
  if (process.env[key] !== value) throw new Error(`测试 API 资源变量冲突：${key}`)
inspectTestContainers(config)
installTestNetworkGuard(undefined, true)
