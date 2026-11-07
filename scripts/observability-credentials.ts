import 'dotenv/config'
import { alertEmailEnabled, alertmanagerConfig } from './observability-alert-config'
import { randomBytes } from 'node:crypto'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const directory = resolve('tmp/observability-secrets')
mkdirSync(directory, { recursive: true, mode: 0o700 })
const password = resolve(directory, 'grafana-admin-password')
if (!existsSync(password))
  writeFileSync(password, randomBytes(32).toString('base64url') + '\n', { mode: 0o600 })
writeFileSync(
  resolve(directory, 'grafana-login.txt'),
  'URL: http://127.0.0.1:3300\nUsername: admin\nPassword file: grafana-admin-password\n',
  { mode: 0o600 },
)
const enabled = alertEmailEnabled(process.env.FORMULA_ALERT_EMAIL_ENABLED)
let mail: { sender: string; recipient: string } | undefined
const smtpSecret = resolve(directory, 'qq-smtp-password')
if (enabled) {
  const user = process.env.FORMULA_SMTP_USER?.trim(),
    pass = process.env.FORMULA_SMTP_PASSWORD?.trim()
  const recipient = process.env.FORMULA_ALERT_TO?.trim() || user
  if (!user || !pass || !recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
    throw new Error('告警SMTP配置不完整；未输出配置内容。')
  writeFileSync(smtpSecret, pass + '\n', { mode: 0o600 })
  mail = { sender: user, recipient }
} else if (!existsSync(smtpSecret)) {
  // Compose mounts this file even when no receiver uses SMTP. Never copy credentials by default.
  writeFileSync(smtpSecret, 'email-disabled\n', { mode: 0o600 })
}
writeFileSync(resolve(directory, 'alertmanager.yaml'), alertmanagerConfig(mail), { mode: 0o600 })
console.log(
  enabled
    ? '观测凭据已准备，告警邮件已显式启用。'
    : '观测凭据已准备，告警仅在面板显示，不发送邮件。',
)
