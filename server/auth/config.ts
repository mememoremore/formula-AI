import { betterAuth } from 'better-auth/minimal'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { authProfileViolation } from './profile-policy'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import type { PrismaClient } from '../generated/prisma/client'

interface AuthConfiguration {
  secret: string
  baseURL: string
  isDevelopment: boolean
}

/** 认证策略集中在这里；不依赖 Nuxt，便于集成测试和独立运行。 */
export function createAuthentication(db: PrismaClient, config: AuthConfiguration) {
  const site = new URL(config.baseURL)
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname)
  if (site.protocol !== 'https:' && !(site.protocol === 'http:' && isLoopback)) {
    throw new Error('账号服务需要 HTTPS，本机回环地址允许使用 HTTP。')
  }
  const origin = site.origin
  return betterAuth({
    appName: 'Formula AI',
    secret: config.secret,
    baseURL: origin,
    database: prismaAdapter(db, { provider: 'postgresql', transaction: true }),
    user: { modelName: 'User', fields: { name: 'displayName' } },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        const violation = authProfileViolation(context.path, context.body)
        if (violation) throw new APIError('BAD_REQUEST', { message: violation })
      }),
    },
    account: { modelName: 'AuthAccount', accountLinking: { enabled: false } },
    verification: { modelName: 'AuthVerification' },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: false,
    },
    session: {
      modelName: 'AuthSession',
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    trustedOrigins: config.isDevelopment
      ? [origin, 'http://127.0.0.1:3000', 'http://localhost:3000']
      : [origin],
    advanced: {
      database: { generateId: 'uuid' },
      // HTTP 入口会用实际连接地址覆盖此头，忽略浏览器伪造的转发地址。
      ipAddress: { ipAddressHeaders: ['x-formula-client-ip'] },
      useSecureCookies: new URL(origin).protocol === 'https:',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'AuthRateLimit',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 8 },
        '/sign-up/email': { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (user.image)
              throw new APIError('BAD_REQUEST', { message: '头像必须在编辑资料中上传。' })
            const name = user.name.trim()
            if (!name || name.length > 100) {
              throw new APIError('BAD_REQUEST', { message: '昵称需要包含 1～100 个字符。' })
            }
            return { data: { ...user, name, email: user.email.trim().toLowerCase() } }
          },
        },
        update: {
          before: async (user) => {
            if (user.image !== undefined)
              throw new APIError('BAD_REQUEST', { message: '头像必须通过资料服务更新或重置。' })
            if (
              user.name !== undefined &&
              (typeof user.name !== 'string' || !user.name.trim() || user.name.trim().length > 100)
            ) {
              throw new APIError('BAD_REQUEST', { message: '昵称需要包含 1～100 个字符。' })
            }
            return {
              data: {
                ...user,
                ...(user.name === undefined ? {} : { name: user.name.trim() }),
                ...(user.email === undefined ? {} : { email: user.email.trim().toLowerCase() }),
              },
            }
          },
        },
      },
    },
  })
}
