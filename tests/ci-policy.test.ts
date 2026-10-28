import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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
