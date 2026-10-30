import nodemailer from 'nodemailer'

export function registrationMailConfigured() {
  return !!process.env.FORMULA_SMTP_USER?.trim() && !!process.env.FORMULA_SMTP_PASSWORD?.trim()
}

export async function sendRegistrationCode(email: string, otp: string) {
  const user = process.env.FORMULA_SMTP_USER?.trim()
  const pass = process.env.FORMULA_SMTP_PASSWORD?.trim()
  if (!user || !pass) throw new Error('邮箱验证服务尚未配置。')
  const transport = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  })
  await transport.sendMail({
    from: { name: 'Formula AI', address: user },
    to: email,
    subject: 'Formula AI 注册验证码',
    text: `你的注册验证码是 ${otp}，5 分钟内有效。请勿向任何人透露此验证码。`,
  })
}
