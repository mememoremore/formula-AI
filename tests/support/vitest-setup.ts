import { cleanTestProcessEnvironment } from './test-runtime'
import { installTestNetworkGuard } from './network-guard'

// Also protect direct `vitest` runs that bypass the npm wrapper.
const clean = cleanTestProcessEnvironment()
for (const key of Object.keys(process.env)) if (!(key in clean)) delete process.env[key]
Object.assign(process.env, clean)
installTestNetworkGuard()
