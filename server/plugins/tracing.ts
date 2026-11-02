import { shutdownTraces } from '../diagnostics/tracing'
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('close', shutdownTraces)
})
