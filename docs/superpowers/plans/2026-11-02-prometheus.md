# Prometheus 与运行总览实施计划

已批准范围：账号API请求量/错误率/延迟，任务积压/排队/处理与结果，AI首字/生成耗时，Worker重试/并发及进程指标；Grafana运行总览；不添加告警。

- [x] 独立Registry与显式启用开关，使用官方 @prometheus-io/client 固定版本；标签白名单，无用户/任务/trace ID。
- [x] API只读指标入口默认404；Worker仅在显式启用时监听本机9464。
- [x] 现有任务执行点计数；重试、失去执行权、取消、完成分开。队列快照只读后台采样，失败明确标记，不把陈旧值当实时零值。
- [x] Prometheus独立容器、7天及1GB保留上限；沿用Grafana，无重复Alloy采集。
- [x] 总览自动配置，低流量/无样本不制造成功率或P95数字；提供服务可用性、HTTP、队列、任务、AI及进程图。
- [x] 测试标签、失败/重试/取消口径、快照故障；运行类型/单元/构建和隔离集成，验证实际Prometheus targets/查询及Grafana数据源/看板。界面人工查看受上轮浏览器自动审批额度限制时如实记录，不绕过。

不执行迁移、不调用真实AI产生演示数据、不修改备份或模型目录；保留之前未提交改动，不自动提交Git。

## 修改清单

| 文件                                                                        | 原因                                                             |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| package.json / package-lock.json                                            | 固定官方 @prometheus-io/client 0.16.1，未保留已弃用prom-client。 |
| server/diagnostics/metrics.ts                                               | 独立注册表、HTTP/任务/AI指标与取消上下文，标签白名单。           |
| server/diagnostics/worker-metrics.ts                                        | 本机指标服务、无重入的只读队列快照、失效标记和退出清理。         |
| server/api/metrics.get.ts                                                   | 默认关闭的API采集入口，不计入自身请求指标。                      |
| server/utils/workspace-operation.ts                                         | 按实际响应状态和耗时记录账号HTTP，排除SSE。                      |
| server/worker/lifecycle.ts                                                  | 已领取尝试的执行/等待/结果指标，重试与终态区分。                 |
| server/worker/chat.ts                                                       | 首个内容片段与流生成计时，识别已确认取消。                       |
| scripts/worker.ts                                                           | 指标服务与Worker共同启动/退出。                                  |
| scripts/observability-dev.ps1                                               | 本机显式启用指标与9464端口。                                     |
| nuxt.config.ts                                                              | 指标启用时仅增加Docker内部主机名白名单。                         |
| compose.observability.yaml                                                  | 独立Prometheus、7天/1GB保留、默认首页总览。                      |
| observability/prometheus.yaml                                               | 三个服务的直接采集，15秒间隔。                                   |
| observability/grafana/provisioning/datasources/default.yaml                 | Prometheus数据源。                                               |
| observability/grafana/provisioning/dashboards/default.yaml                  | 30秒轮询，修复Windows挂载看板更新。                              |
| observability/grafana/provisioning/dashboards/overview.json                 | 25个面板/24条查询，服务筛选、无样本与快照过期过滤。              |
| services/recognition/app/main.py / telemetry.py                             | 显式启用的Python进程指标，不新增模型依赖。                       |
| compose.recognition-observability.yaml                                      | 为本机Python服务显式开启指标。                                   |
| services/recognition/tests/test_api.py                                      | 指标默认404、启用后200和敏感信息排除。                           |
| tests/metrics.test.ts / metrics-api.test.ts                                 | 标签安全、重试/取消口径、快照状态、首字去重与真实采集接口。      |
| scripts/test-suite.ts / test-environment.ts / tests/support/test-runtime.ts | 注册测试、隔离环境显式启用API指标、过滤开发指标配置。            |
| README.md / docs/OBSERVABILITY.md / 本文档                                  | 使用入口、口径、边界与实际验收。                                 |

## 验证

- 完整quality检查通过：类型、格式、144项单元、协议、生产构建及私有配置扫描。
- 隔离集成229/229通过（272秒含启动清理）；清理2个测试容器，未动开发数据。
- Python9/9通过，无模型挂载、无外网。
- 实际Prometheus API确认API/Worker/Python均UP；Grafana数据源健康200，运行中看板为25个面板，24条实际Grafana查询均成功。PromQL自查没有错误或非有限数值。
- 真实只读未登录请求用于核对API计数/延迟，未调用真实AI或创建用户业务数据；没有AI样本的图按设计保持空。
- 人工视觉验收仍受此前浏览器自动审批额度限制，未绕过；完成的是实际采集数据、Grafana数据源与查询面板接口验收，不宣称看过截图。
- 无数据库迁移，无备份/模型目录操作，未提交Git。

## 边界

这是本机单Worker的观测基线；不是持久计费统计或集群资源监控。Python进程计量使用标准库；现有Grafana Viewer Explore兼容选项仍是前轮记录的升级项。本轮没有引入额外自建监控框架或新业务数据表。
