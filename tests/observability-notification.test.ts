import { test, expect } from 'vitest'
import { alertEmailEnabled, alertmanagerConfig } from '../scripts/observability-alert-config'

test('监控邮件默认关闭，与SMTP配置独立，非法开关拒绝启动', () => {
  expect(alertEmailEnabled()).toBe(false)
  expect(alertEmailEnabled('false')).toBe(false)
  expect(alertEmailEnabled(' true ')).toBe(true)
  for (const value of ['', 'yes', '1', 'TRUE'])
    expect(() => alertEmailEnabled(value)).toThrow('仅支持true或false')
})
test('本地接收器不包含邮件或其他外部通知集成', () => {
  const config = alertmanagerConfig()
  expect(config).toContain('receiver: local-panel')
  expect(config).not.toMatch(/smtp|email_configs|qq-email|webhook_configs|send_resolved/)
})
test('显式启用时保留收件人、重复频率、恢复通知和Worker告警抑制', () => {
  const config = alertmanagerConfig({
    sender: 'sender@example.test',
    recipient: 'receiver@example.test',
  })
  expect(config).toContain('smtp_from: "sender@example.test"')
  expect(config).toContain('to: "receiver@example.test"')
  expect(config).toContain('repeat_interval: 4h')
  expect(config).toContain('send_resolved: true')
  expect(config).toContain('inhibit_rules:')
  expect(config).toContain('smtp_auth_password_file: /run/secrets/qq-smtp-password')
})
