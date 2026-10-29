import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  safeTestDiagnostics,
  safeRuntimeSignals,
  publicFixtureErrorTemplate,
} from './support/test-diagnostics'

test('匿名公开页错误模板屏蔽配置、引用值、路径、邮箱及不透明标识', () => {
  const secret = 'local-private-config-guard-token'
  const template = publicFixtureErrorTemplate(
    `ReferenceError: ${secret} 'private question' /home/runner/private.js user@example.test`,
    [secret],
  )
  for (const value of [secret, 'private question', '/home/runner', 'user@example.test'])
    assert.ok(!template.includes(value))
  assert.ok(template.includes('ReferenceError'))
})

test('运行信号仅发布固定错误分类，绝不复制原始异常与 URL', () => {
  assert.deepEqual(
    safeRuntimeSignals(
      '测试网络策略拒绝非受控连接 http://private-token@host/secret\nCannot find module password',
    ),
    ['TEST_NETWORK_DENIED', 'MODULE_MISSING'],
  )
})

test('失败诊断仅发布静态源码测试名，不暴露断言/凭据/请求内容', () => {
  const secret = 'fixture-private-cookie-never-publish'
  const result = safeTestDiagnostics(
    `✖ 原有任务断言 (1.3ms)\n✖ ${secret} (2ms)\nAssertionError [ERR_ASSERTION]: expected ${secret}\nCookie: ${secret}\nℹ tests 2\nℹ pass 0\nℹ fail 2`,
    { 'tests/jobs.test.ts': "test('原有任务断言', async () => {})" },
  )
  assert.deepEqual(result.counts, { tests: 2, pass: 0, fail: 2 })
  assert.deepEqual(result.failures, [{ name: '原有任务断言', file: 'tests/jobs.test.ts' }])
  assert.equal(result.unpublishedFailureNames, 1)
  assert.ok(!JSON.stringify(result).includes(secret))
})
test('TAP诊断保留计数但不采用伪造的文件和源码外名称', () => {
  const result = safeTestDiagnostics(
    'not ok 1 - 正常用例\n# tests 1\n# fail 1\n/home/private/user.ts',
    {
      '../private.ts': "test('正常用例', () => {})",
      'tests/sample.test.ts': "test('正常用例', () => {})",
    },
  )
  assert.deepEqual(result.failures, [{ name: '正常用例', file: 'tests/sample.test.ts' }])
  assert.deepEqual(result.files, [])
  assert.equal(result.counts.fail, 1)
})

test('CI 无生产密钥/部署/原始历史推送，Action 全部固定 SHA 且权限只读', () => {
  const workflow = readFileSync('.github/workflows/quality.yml', 'utf8')
  assert.match(workflow, /permissions:\s*\n\s+contents: read/)
  assert.doesNotMatch(
    workflow,
    /pull_request_target|secrets\.|git push|npm run db:migrate|npm run build\s*$/m,
  )
  const actions = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((item) => item[1]!)
  assert.ok(actions.length >= 3)
  assert.ok(actions.every((action) => /^actions\/[a-z-]+@[a-f0-9]{40}$/.test(action)))
  assert.equal(
    (workflow.match(/persist-credentials: false/g) ?? []).length,
    actions.filter((action) => action.startsWith('actions/checkout@')).length,
  )
  assert.match(workflow, /npm ci --ignore-scripts/)
})
test('远端产物只允许安全摘要，不上传环境清单、认证和原始 Trace/日志', () => {
  const workflow = readFileSync('.github/workflows/quality.yml', 'utf8')
  const paths = [...workflow.matchAll(/^\s+path:\s*(.+)$/gm)].map((item) => item[1]!)
  assert.ok(paths.length > 0)
  assert.ok(paths.every((path) => path === 'tmp/r16-artifacts/**/summary.json'))
  assert.doesNotMatch(
    workflow,
    /include-hidden-files: true|path:.*(?:r1-test|trace|\.log|environment)/,
  )
})
