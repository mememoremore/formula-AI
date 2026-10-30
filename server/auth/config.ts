import { betterAuth } from 'better-auth/minimal'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { authProfileViolation } from './profile-policy'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { emailOTP } from 'better-auth/plugins'
import { verifyPassword } from 'better-auth/crypto'
import { sendRegistrationCode, registrationMailConfigured } from './registration-mail'
import type { PrismaClient } from '../generated/prisma/client'

interface AuthConfiguration {
  secret: string
  baseURL: string
  isDevelopment: boolean
  sendRegistrationCode?: (email: string, otp: string) => Promise<void>
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
        if (context.path === '/sign-up/email' && !config.sendRegistrationCode && !registrationMailConfigured()) {
          throw new APIError('SERVICE_UNAVAILABLE', { message: '邮箱验证服务尚未配置。' })
        }
        if (context.path === '/sign-in/email' && typeof context.body?.email === 'string') {
          const email = context.body.email.trim().toLowerCase()
          const user = await db.user.findUnique({ where: { email }, select: { id: true, emailVerified: true } })
          if (user && !user.emailVerified) {
            const pending = await db.authVerification.findFirst({
              where: { identifier: 'formula:registration-verification:' + user.id },
              select: { id: true },
            })
            if (pending && typeof context.body.password === 'string') {
              const credential = await db.authAccount.findFirst({
                where: { userId: user.id, providerId: 'credential' },
                select: { password: true },
              })
              if (credential?.password && await verifyPassword({ hash: credential.password, password: context.body.password })) {
                throw new APIError('FORBIDDEN', { message: '请先验证邮箱。' })
              }
            }
          }
        }
      }),
    },
    account: { modelName: 'AuthAccount', accountLinking: { enabled: false } },
    verification: { modelName: 'AuthVerification' },
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: false,
    },
    plugins: [
      emailOTP({
        sendVerificationOnSignUp: true,
        storeOTP: 'hashed',
        expiresIn: 300,
        allowedAttempts: 3,
        rateLimit: { window: 60, max: 3 },
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== 'email-verification') throw new Error('不支持该验证码用途。')
          await (config.sendRegistrationCode ?? sendRegistrationCode)(email, otp)
        },
      }),
    ],
    disabledPaths: ['/sign-in/email-otp', '/email-otp/forget-password', '/email-otp/request-password-reset', '/email-otp/reset-password'],
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
          after: async (user) => {
            await db.authVerification.create({
              data: {
                identifier: 'formula:registration-verification:' + user.id,
                value: 'required',
                expiresAt: new Date('9999-12-31T00:00:00.000Z'),
              },
            })
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
