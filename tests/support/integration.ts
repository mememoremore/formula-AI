import {
  loadTestManifest,
  inspectContainer,
  assertLocalDocker,
  applyTestVariables,
} from './test-runtime.ts'
import { verifyTestTargets } from './test-environment.ts'
import { installTestNetworkGuard } from './network-guard.ts'

// 顶层等待先于测试模块的客户端创建、before/after 和 fixture 执行。
const config = loadTestManifest()
assertLocalDocker()
installTestNetworkGuard([3100, 15432, 18333])
export const testEnvironment = await verifyTestTargets(
  config,
  process.env,
  inspectContainer,
  async (value) => {
    const response = await fetch(`${value.apiUrl}/api/__test/identity`, {
      headers: { 'x-formula-test-token': value.token },
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    })
    if (!response.ok) throw new Error('测试安全检查拒绝执行：API 身份接口不可用')
    return response.json()
  },
)
applyTestVariables(testEnvironment)
