# 2026-11-02 观测与公式渲染交付记录

## 实现

使用 W3C traceparent 贯通浏览器、HTTP、异步队列、Worker 与 Python；requestId 保留每次请求身份。Loki 集中安全日志，Tempo 查询链路，Prometheus 采集运行指标；Grafana 展示并关联。新增 Alertmanager QQ 通知、Grafana 登录、独立观测备份恢复及前端异常摘要。公式渲染统一处理数学边界，不改写旧数据库记录。

无业务 Schema 迁移，现有模型与备份保留。限流与采集队列有界，遥测失败不阻断业务。

## 验证

已执行：类型检查通过；147项单元、协议测试、9项Python、7项Word导出通过；隔离构建与客户端私有配置扫描通过；promtool告警规则测试通过。浏览器识别/对话/导出等3项、Worker故障恢复1项、追踪及三类异常采集1项通过。完整集成回归最终229/229通过（291秒含启动清理），测试容器2个已清理，未操作开发资源。首轮一项故障子进程退出断言失败，停止并行构建后完整复跑未复现；没有修改测试断言。

命令：quality:quick（初次构建期间package.json变化导致验收拒绝，随后单独check:build通过）、test:isolated、test:alerts、test:recognition-service、test:documents；针对性浏览器用test-isolated runner选择相关spec。原始日志仅保存在本机tmp。操作说明见 [观测指南](OBSERVABILITY.md)。

## 未验证与风险

Grafana 人工视觉验收受浏览器自动审批额度拒绝影响，未绕过；以接口查询验证看板与数据。邮件确认到 SMTP 接受，不保证收件箱投递。尚未部署服务器 TLS、异机完整灾备、自动备份计划与磁盘 exporter。遥测为诊断用途，可能丢失；不能替代审计或计费。初始告警阈值需按真实流量调整。

技术债务：Python 最小标准库 OTLP 导出器尚未切换正式 SDK；日志轮转与浏览器退出采用尽力投递；指标面向单 Worker。均已在指南明确边界。

## 文件与修改原因

| 文件                                                           | 原因                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| `.github/workflows/quality.yml`                                | 在 CI 中验证告警规则                                     |
| `README.md`                                                    | 说明监控使用、隐私边界、部署、备份和验证结果             |
| `app/app.vue`                                                  | 提供失败时的脱敏诊断复制入口                             |
| `app/components/AccountCategoryManager.vue`                    | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/components/AccountCategoryPicker.vue`                     | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/components/AccountChatDraft.vue`                          | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/components/AccountExport.vue`                             | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/components/AccountExportTask.vue`                         | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/components/AccountFormulaEditor.vue`                      | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/components/AccountFormulaExplanations.vue`                | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/components/AccountProfileEditor.vue`                      | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/components/AccountRecognitionTask.vue`                    | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/components/DiagnosticCopy.vue`                            | 提供失败时的脱敏诊断复制入口                             |
| `app/components/FormulaExplanationContent.vue`                 | 统一数学片段归一化和渲染，保护代码片段并兼容历史解释     |
| `app/composables/useAccountChat.ts`                            | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/composables/useAccountFavorite.ts`                        | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/composables/useAccountFetch.ts`                           | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/composables/useAccountFormula.ts`                         | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/composables/useAccountHistory.ts`                         | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/composables/useAccountLibrary.ts`                         | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/composables/useAccountRecognition.ts`                     | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/composables/useConversationListing.ts`                    | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/composables/useHomeOverview.ts`                           | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/composables/useManualFormulaCreation.ts`                  | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/composables/useTaskPolling.ts`                            | 使用保留 SSR Cookie 的账号请求客户端，贯通请求与任务追踪 |
| `app/plugins/tracing.client.ts`                                | 浏览器请求/操作追踪及去重限流的前端异常采集              |
| `app/utils/browser-errors.ts`                                  | 生成不含 message/stack 的异常摘要及客户端采集预算        |
| `app/utils/chat-content.ts`                                    | 统一数学片段归一化和渲染，保护代码片段并兼容历史解释     |
| `compose.observability-secure.yaml`                            | 独立部署观测栈、登录覆盖配置或现有 Python 服务观测挂载   |
| `compose.observability.yaml`                                   | 独立部署观测栈、登录覆盖配置或现有 Python 服务观测挂载   |
| `compose.recognition-observability.yaml`                       | 独立部署观测栈、登录覆盖配置或现有 Python 服务观测挂载   |
| `docs/OBSERVABILITY.md`                                        | 说明监控使用、隐私边界、部署、备份和验证结果             |
| `docs/superpowers/plans/2026-11-02-explanation-math.md`        | 记录用户批准的设计、实施顺序和验收边界                   |
| `docs/superpowers/plans/2026-11-02-observability-hardening.md` | 记录用户批准的设计、实施顺序和验收边界                   |
| `docs/superpowers/plans/2026-11-02-observability.md`           | 记录用户批准的设计、实施顺序和验收边界                   |
| `docs/superpowers/plans/2026-11-02-prometheus.md`              | 记录用户批准的设计、实施顺序和验收边界                   |
| `nuxt.config.ts`                                               | 显式观测开关、路由映射与受限开发采集 Host                |
| `observability/alerts.test.yaml`                               | 验证告警触发/恢复和无流量、取消、旧快照的抑制            |
| `observability/alerts.yaml`                                    | 定义带持续时间与样本门槛的六项基础告警                   |
| `observability/config.alloy`                                   | 配置独立采集管道、追踪存储、日志保留与指标抓取           |
| `observability/grafana/provisioning/dashboards/alerts.json`    | 配置指标/日志/追踪数据源、互跳和运行/告警看板            |
| `observability/grafana/provisioning/dashboards/default.yaml`   | 配置指标/日志/追踪数据源、互跳和运行/告警看板            |
| `observability/grafana/provisioning/dashboards/overview.json`  | 配置指标/日志/追踪数据源、互跳和运行/告警看板            |
| `observability/grafana/provisioning/dashboards/runtime.json`   | 配置指标/日志/追踪数据源、互跳和运行/告警看板            |
| `observability/grafana/provisioning/datasources/default.yaml`  | 配置指标/日志/追踪数据源、互跳和运行/告警看板            |
| `observability/loki.yaml`                                      | 配置独立采集管道、追踪存储、日志保留与指标抓取           |
| `observability/prometheus.yaml`                                | 配置独立采集管道、追踪存储、日志保留与指标抓取           |
| `observability/tempo.yaml`                                     | 配置独立采集管道、追踪存储、日志保留与指标抓取           |
| `package-lock.json`                                            | 固定追踪/指标依赖并提供验证命令与共享模块映射            |
| `package.json`                                                 | 固定追踪/指标依赖并提供验证命令与共享模块映射            |
| `scripts/check-source-format.ts`                               | 将监控、类型、格式和回归测试纳入隔离质量验证             |
| `scripts/observability-auth.ts`                                | 通过标准输入初始化已有 Grafana 管理员密码                |
| `scripts/observability-backup.ts`                              | 验证卷归属后备份，并在独立卷校验 Grafana 恢复            |
| `scripts/observability-credentials.ts`                         | 将 Grafana 与邮件凭据准备到被 Git 忽略的本地目录         |
| `scripts/observability-dev.ps1`                                | 检查空闲任务后仅重载当前项目 API/Worker，保留业务资源    |
| `scripts/observability-idle.ts`                                | 检查空闲任务后仅重载当前项目 API/Worker，保留业务资源    |
| `scripts/observability-secure.ps1`                             | 统一安全覆盖配置启动与已有密码初始化                     |
| `scripts/test-alerts.ts`                                       | 将监控、类型、格式和回归测试纳入隔离质量验证             |
| `scripts/test-environment.ts`                                  | 将监控、类型、格式和回归测试纳入隔离质量验证             |
| `scripts/test-suite.ts`                                        | 将监控、类型、格式和回归测试纳入隔离质量验证             |
| `scripts/worker.ts`                                            | 启动和关闭 Worker 追踪与指标生命周期                     |
| `server/api/account/telemetry/errors.post.ts`                  | 提供默认受控的指标或已登录同源限长限流遥测入口           |
| `server/api/account/telemetry/traces.post.ts`                  | 提供默认受控的指标或已登录同源限长限流遥测入口           |
| `server/api/metrics.get.ts`                                    | 提供默认受控的指标或已登录同源限长限流遥测入口           |
| `server/chat/prompt.ts`                                        | 统一数学片段归一化和渲染，保护代码片段并兼容历史解释     |
| `server/diagnostics/browser-errors.ts`                         | 有界追踪/指标/安全日志采集、浏览器白名单校验与上下文关联 |
| `server/diagnostics/browser-telemetry.ts`                      | 有界追踪/指标/安全日志采集、浏览器白名单校验与上下文关联 |
| `server/diagnostics/log-sink.ts`                               | 有界追踪/指标/安全日志采集、浏览器白名单校验与上下文关联 |
| `server/diagnostics/metrics.ts`                                | 有界追踪/指标/安全日志采集、浏览器白名单校验与上下文关联 |
| `server/diagnostics/operations.ts`                             | 有界追踪/指标/安全日志采集、浏览器白名单校验与上下文关联 |
| `server/diagnostics/tracing.ts`                                | 有界追踪/指标/安全日志采集、浏览器白名单校验与上下文关联 |
| `server/diagnostics/worker-metrics.ts`                         | 有界追踪/指标/安全日志采集、浏览器白名单校验与上下文关联 |
| `server/plugins/tracing.ts`                                    | 关闭服务时清理追踪导出器                                 |
| `server/queue/client.ts`                                       | 在队列任务 JSON 中兼容地传递追踪父上下文                 |
| `server/queue/enqueue.ts`                                      | 在队列任务 JSON 中兼容地传递追踪父上下文                 |
| `server/recognition/python-adapter.ts`                         | 给 Python 请求传递追踪头并记录独立调用 span              |
| `server/utils/workspace-operation.ts`                          | 建立 HTTP span、准确错误状态和诊断响应头                 |
| `server/worker/chat.ts`                                        | 记录任务尝试、取消/重试口径、AI首字及 Word 步骤          |
| `server/worker/export.ts`                                      | 记录任务尝试、取消/重试口径、AI首字及 Word 步骤          |
| `server/worker/lifecycle.ts`                                   | 记录任务尝试、取消/重试口径、AI首字及 Word 步骤          |
| `services/recognition/app/main.py`                             | Python 安全日志、最小有界 OTLP 导出和进程指标及回归      |
| `services/recognition/app/telemetry.py`                        | Python 安全日志、最小有界 OTLP 导出和进程指标及回归      |
| `services/recognition/tests/test_api.py`                       | Python 安全日志、最小有界 OTLP 导出和进程指标及回归      |
| `shared/explanation.ts`                                        | 统一数学片段归一化和渲染，保护代码片段并兼容历史解释     |
| `shared/math-content.ts`                                       | 统一数学片段归一化和渲染，保护代码片段并兼容历史解释     |
| `shared/trace-context.ts`                                      | 校验 W3C 追踪上下文并清理动态路由                        |
| `tests/browser-errors.test.ts`                                 | 覆盖数学渲染、追踪关联、隐私、指标及故障恢复的隔离回归   |
| `tests/chat-content.test.ts`                                   | 覆盖数学渲染、追踪关联、隐私、指标及故障恢复的隔离回归   |
| `tests/e2e/explanation-math.spec.ts`                           | 覆盖数学渲染、追踪关联、隐私、指标及故障恢复的隔离回归   |
| `tests/e2e/faults.spec.ts`                                     | 覆盖数学渲染、追踪关联、隐私、指标及故障恢复的隔离回归   |
| `tests/e2e/observability.spec.ts`                              | 覆盖数学渲染、追踪关联、隐私、指标及故障恢复的隔离回归   |
| `tests/e2e/worker.ts`                                          | 覆盖数学渲染、追踪关联、隐私、指标及故障恢复的隔离回归   |
| `tests/explanation.test.ts`                                    | 覆盖数学渲染、追踪关联、隐私、指标及故障恢复的隔离回归   |
| `tests/metrics-api.test.ts`                                    | 覆盖数学渲染、追踪关联、隐私、指标及故障恢复的隔离回归   |
| `tests/metrics.test.ts`                                        | 覆盖数学渲染、追踪关联、隐私、指标及故障恢复的隔离回归   |
| `tests/runtime/nuxt.config.ts`                                 | 覆盖数学渲染、追踪关联、隐私、指标及故障恢复的隔离回归   |
| `tests/support/test-runtime.ts`                                | 覆盖数学渲染、追踪关联、隐私、指标及故障恢复的隔离回归   |
| `tests/tracing.test.ts`                                        | 覆盖数学渲染、追踪关联、隐私、指标及故障恢复的隔离回归   |
| `docs/2026-11-02-observability-release.md`                     | 说明监控使用、隐私边界、部署、备份和验证结果             |
