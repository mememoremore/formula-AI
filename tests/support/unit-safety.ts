import { installTestNetworkGuard } from './network-guard.ts'

// 协议测试允许动态回环替身；不允许公网和开发服务默认端口。
installTestNetworkGuard()
