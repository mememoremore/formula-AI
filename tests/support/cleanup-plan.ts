import {
  environmentFingerprint,
  verifyContainerIdentity,
  type TestEnvironment,
} from './test-environment.ts'

/** Validate every target before removing any. Discovery alone is never deletion authority. */
export function cleanupPlan(config: TestEnvironment, inputs: unknown[]) {
  const ids: string[] = []
  for (const input of inputs) {
    if (!input || typeof input !== 'object') throw new Error('拒绝不明确的清理对象')
    const value = input as { Id?: unknown; Config?: { Labels?: Record<string, string> } }
    const kind = value.Config?.Labels?.['com.docker.compose.service']
    if ((kind !== 'postgres' && kind !== 'storage') || typeof value.Id !== 'string')
      throw new Error('拒绝非测试服务清理对象')
    if (
      ids.includes(value.Id) ||
      inputs.filter(
        (entry) => (entry as typeof value)?.Config?.Labels?.['com.docker.compose.service'] === kind,
      ).length !== 1
    )
      throw new Error('拒绝重复测试服务')
    if (config.containers[kind] && config.containers[kind] !== value.Id)
      throw new Error('清理目标与已登记容器不一致')
    const candidate = { ...config, containers: { ...config.containers, [kind]: value.Id } }
    verifyContainerIdentity(candidate, kind, input, 'cleanup')
    ids.push(value.Id)
  }
  return { ids, fingerprint: environmentFingerprint(config) }
}
