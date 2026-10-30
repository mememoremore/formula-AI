import { createAuthClient } from 'better-auth/vue'
import { emailOTPClient } from 'better-auth/client/plugins'

// 登录动作只在浏览器中调用，使用同源地址；会话读取由 Nuxt useFetch 转发 SSR Cookie。
export const authClient = createAuthClient({ plugins: [emailOTPClient()] })
