import '../support/integration.ts'
// 注入内部信号以验证真实入口的关闭逻辑；不是Linux OS信号/崩溃测试。
process.on('message', (message) => {
  if (message === 'stop') process.emit('SIGTERM', 'SIGTERM')
})
await import('../../scripts/worker.ts')
if (process.exitCode) throw new Error('Worker startup failed')
process.send?.({ ready: true })
