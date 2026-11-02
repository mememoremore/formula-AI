# 日志贯通与 Trace 查询实施计划

用户已确认：先完成 Grafana + Alloy + Loki + Tempo，暂不接 Prometheus。

- [x] 固定版本独立 Compose：仅本机端口，独立数据卷与 7 天保留；Grafana 自动配置数据源、日志与 trace 双向关联。
- [x] SDK 手动埋点与严格 W3C 上下文：HTTP、队列、Worker attempt、Python 调用、AI 生成、导出；旧队列载荷兼容，无迁移，不改变幂等与额度。
- [x] 现有白名单日志增加 timestamp/service/environment/traceId/spanId，写入有容量限制的专用 JSONL；Alloy 不采集带凭据的原始调试日志。
- [x] 浏览器 SDK 用显式上下文关联识别上传和提交；其余账号写请求自动建立独立请求 span。认证、同源、限长、严格白名单的浏览器遥测入口；不记录用户输入。
- [x] 复制诊断信息入口携带编号、时间、错误状态与静态路径，不含正文/图片/凭据。
- [x] Python 追踪与结构化日志不修改模型依赖，不重装模型权重；采集异常不影响推理。
- [x] 单元/集成/浏览器验证、实际 Grafana 数据源查询、关闭采集器仍可业务运行；撰写使用指南与已知边界。

默认关闭导出，只有显式配置本机采集器才启用；测试环境清除相关变量，验收另用受控遥测样本。已有未提交的公式渲染修复保留，不混淆完成记录。直接在本轮执行已批准方案，不自动提交或推送。

## 实际验证与限制

- 完整质量检查：类型、格式、资源、140项单元、协议与生产构建/私有配置扫描通过；最后一次检查在正常取消过滤后重跑。
- 隔离集成228/228通过（237秒含启动清理），清理2个测试容器，未改开发资源。
- 浏览器端到端：真实页面提交→请求头→HTTP响应→队列JSON→Worker日志，traceId一致；浏览器OTLP入口204；503时诊断入口出现并不包含账号邮箱。
- Python 8项测试通过；真实Python未鉴权探针返回401，不调用模型/不消耗额度，API和Python的日志及span在Grafana查询API中均可按相同traceId查到。
- 采集器不可达探针：业务函数正常返回7ms，flush不影响业务返回。
- Grafana/Loki/Tempo/Alloy均运行；默认看板及日志/trace查询API通过；只读用户具备datasources:explore能力。Grafana固定12.3启用viewers_can_edit以开放Explore，但不允许保存看板修改；该选项已弃用，未来升级时应改用独立认证查询角色。
- 人工界面验收未完成：打开本机Grafana的浏览器操作因自动审批额度限制被拒绝，未尝试其他浏览器或绕过；平台查询能力通过API验证。
- Python使用最小标准库OTLP导出、固定Grafana版本的Viewer Explore选项，是本轮明确保留的后续升级项。没有数据库迁移、真实AI调用或备份/模型文件操作。未提交Git。

## 修改文件及原因

上一轮公式渲染修复继续保留，未混入下表。

| 文件                                                        | 原因                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| README.md                                                   | 使用指南、入口说明与实施记录。                                     |
| app/app.vue                                                 | 挂载失败诊断复制入口。                                             |
| app/components/AccountCategoryManager.vue                   | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/components/AccountCategoryPicker.vue                    | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/components/AccountChatDraft.vue                         | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/components/AccountExport.vue                            | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/components/AccountExportTask.vue                        | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/components/AccountFormulaEditor.vue                     | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/components/AccountFormulaExplanations.vue               | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/components/AccountProfileEditor.vue                     | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/components/AccountRecognitionTask.vue                   | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/components/DiagnosticCopy.vue                           | 复制经过筛选的编号、时间与状态，不包含用户输入。                   |
| app/composables/useAccountChat.ts                           | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/composables/useAccountFavorite.ts                       | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/composables/useAccountFetch.ts                          | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/composables/useAccountFormula.ts                        | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/composables/useAccountHistory.ts                        | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/composables/useAccountLibrary.ts                        | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/composables/useAccountRecognition.ts                    | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/composables/useConversationListing.ts                   | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/composables/useHomeOverview.ts                          | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/composables/useManualFormulaCreation.ts                 | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/composables/useTaskPolling.ts                           | 使用统一账号请求客户端；SSR继续转发Cookie，浏览器注入追踪上下文。  |
| app/plugins/tracing.client.ts                               | 浏览器 SDK、请求子span、受控上报及正常取消过滤。                   |
| compose.observability.yaml                                  | 独立观测容器/数据卷或Python接入覆盖文件，保留原业务资源。          |
| compose.recognition-observability.yaml                      | 独立观测容器/数据卷或Python接入覆盖文件，保留原业务资源。          |
| docs/OBSERVABILITY.md                                       | 使用指南、入口说明与实施记录。                                     |
| docs/superpowers/plans/2026-11-02-observability.md          | 使用指南、入口说明与实施记录。                                     |
| nuxt.config.ts                                              | 增加显式浏览器观测开关，默认关闭。                                 |
| observability/config.alloy                                  | 采集、存储、查询数据源和默认业务日志看板配置。                     |
| observability/grafana/provisioning/dashboards/default.yaml  | 采集、存储、查询数据源和默认业务日志看板配置。                     |
| observability/grafana/provisioning/dashboards/runtime.json  | 采集、存储、查询数据源和默认业务日志看板配置。                     |
| observability/grafana/provisioning/datasources/default.yaml | 采集、存储、查询数据源和默认业务日志看板配置。                     |
| observability/loki.yaml                                     | 采集、存储、查询数据源和默认业务日志看板配置。                     |
| observability/tempo.yaml                                    | 采集、存储、查询数据源和默认业务日志看板配置。                     |
| package-lock.json                                           | 固定兼容的OpenTelemetry API/SDK/资源与OTLP导出依赖及共享模块映射。 |
| package.json                                                | 固定兼容的OpenTelemetry API/SDK/资源与OTLP导出依赖及共享模块映射。 |
| scripts/observability-dev.ps1                               | 开发服务定向重载与空闲任务保护。                                   |
| scripts/observability-idle.ts                               | 开发服务定向重载与空闲任务保护。                                   |
| scripts/test-environment.ts                                 | 追踪与协议测试、浏览器真实请求验收及测试环境隔离。                 |
| scripts/test-suite.ts                                       | 追踪与协议测试、浏览器真实请求验收及测试环境隔离。                 |
| scripts/worker.ts                                           | 固定Worker服务身份并在退出时刷新追踪。                             |
| server/api/account/telemetry/traces.post.ts                 | 认证同源限长遥测入口，采集异常不影响业务。                         |
| server/diagnostics/browser-telemetry.ts                     | 严格过滤客户端OTLP与路由，限制数量、时间和发送速率。               |
| server/diagnostics/log-sink.ts                              | 仅白名单JSON日志写入专用轮转文件。                                 |
| server/diagnostics/operations.ts                            | 现有日志补齐时间、服务、级别、trace/span关联。                     |
| server/diagnostics/tracing.ts                               | SDK手动span、异步隔离、远程上下文恢复、批量导出及退出刷新。        |
| server/plugins/tracing.ts                                   | API服务退出时关闭遥测导出。                                        |
| server/queue/client.ts                                      | 队列载荷增加可选traceparent并在投递时捕获。                        |
| server/queue/enqueue.ts                                     | 队列载荷增加可选traceparent并在投递时捕获。                        |
| server/recognition/python-adapter.ts                        | 识别调用子span并向Python传播traceparent。                          |
| server/utils/workspace-operation.ts                         | HTTP入口恢复上下文、返回诊断编号并关联嵌套任务响应。               |
| server/worker/chat.ts                                       | 每次Worker执行独立span，细分AI生成和Word转换。                     |
| server/worker/export.ts                                     | 每次Worker执行独立span，细分AI生成和Word转换。                     |
| server/worker/lifecycle.ts                                  | 每次Worker执行独立span，细分AI生成和Word转换。                     |
| services/recognition/app/main.py                            | Python端追踪与安全轮转日志/协议回归，不改模型依赖。                |
| services/recognition/app/telemetry.py                       | Python端追踪与安全轮转日志/协议回归，不改模型依赖。                |
| services/recognition/tests/test_api.py                      | Python端追踪与安全轮转日志/协议回归，不改模型依赖。                |
| shared/trace-context.ts                                     | 校验W3C标识、序列化上下文并过滤动态路由内容。                      |
| tests/e2e/observability.spec.ts                             | 追踪与协议测试、浏览器真实请求验收及测试环境隔离。                 |
| tests/e2e/worker.ts                                         | 追踪与协议测试、浏览器真实请求验收及测试环境隔离。                 |
| tests/runtime/nuxt.config.ts                                | 追踪与协议测试、浏览器真实请求验收及测试环境隔离。                 |
| tests/support/test-runtime.ts                               | 追踪与协议测试、浏览器真实请求验收及测试环境隔离。                 |
| tests/tracing.test.ts                                       | 追踪与协议测试、浏览器真实请求验收及测试环境隔离。                 |

## 最终运行核对

最终源码完整质量检查全部通过：140项单元、类型/格式/协议、生产构建及私有配置扫描（最后构建56.2秒）。当前 Nuxt 与 Worker 已启用观测；原项目 /login 返回200，未登录账号接口返回401并携带trace/request编号，Tempo中对应HTTP状态同样为401。Python识别容器healthy；4个观测容器running。Grafana Viewer具备datasources:explore，日志/trace双向链接模板已从运行配置核对正确。正常页面取消请求不会弹故障诊断。
