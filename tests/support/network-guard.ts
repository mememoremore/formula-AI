import { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { posix } from 'node:path'

let installed = false

export function isNuxtDevelopmentIpc(pipe: string) {
  const nitro = /^nitro-worker-[a-z0-9-]+\.sock$/i
  if (pipe.startsWith('\\\\.\\pipe\\')) {
    const name = pipe.slice('\\\\.\\pipe\\'.length)
    return nitro.test(name) || /^nuxt-vite-[a-f0-9]{8}$/i.test(name)
  }
  if (pipe.startsWith('\0')) return nitro.test(pipe.slice(1))
  const parent = posix.dirname(pipe)
  const roots = [tmpdir().replaceAll('\\', '/'), '/tmp']
  return (
    (roots.includes(parent) && nitro.test(posix.basename(pipe))) ||
    (posix.basename(pipe) === 'nuxt.sock' &&
      /^nuxt-vite-[a-z0-9-]+$/i.test(posix.basename(parent)) &&
      roots.includes(posix.dirname(parent)))
  )
}

/** 最后一层防误调用：禁止公网连接、开发默认端口；集成进程仅开放测试端口。 */
export function installTestNetworkGuard(ports?: readonly number[], allowNuxtIpc = false) {
  if (installed) return
  installed = true
  const original = Socket.prototype.connect
  Object.defineProperty(Socket.prototype, 'connect', {
    configurable: true,
    value(this: Socket, ...args: unknown[]) {
      const normalized = Array.isArray(args[0]) ? args[0] : args
      const first: unknown = normalized[0]
      const options =
        first && typeof first === 'object' ? (first as Record<string, unknown>) : undefined
      const pipe =
        options?.path ?? (typeof first === 'string' && !/^\d+$/.test(first) ? first : undefined)
      if (allowNuxtIpc && typeof pipe === 'string' && isNuxtDevelopmentIpc(pipe))
        return Reflect.apply(original, this, args)
      const port = Number(options?.port ?? first)
      const host = String(
        options?.host ?? (typeof normalized[1] === 'string' ? normalized[1] : 'localhost'),
      )
      if (
        pipe ||
        !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host) ||
        !Number.isInteger(port) ||
        [3000, 5432, 8333, 8001].includes(port) ||
        (ports && !ports.includes(port))
      )
        throw new Error('测试网络策略拒绝非受控连接')
      return Reflect.apply(original, this, args)
    },
  })
}
