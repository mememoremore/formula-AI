# 自动错误中心 Implementation Plan

> 使用 executing-plans 在当前会话按任务执行；用户已批准 Grafana 方案，保留 main，不另建分支。

**Goal:** 用户无须操作即可记录已覆盖异常，开发者从一个中文看板找到错误并打开链路。

**Architecture:** 复用现有采集与 Loki，新增文件式 Grafana 看板和隔离查询回归。不改业务接口、数据库、模型和备份。

**Tech Stack:** Grafana12.3、Loki3.6、Node24、TypeScript。

**Spec:** docs/superpowers/specs/2026-11-02-automatic-errors-design.md

## Global Constraints

不上传原始异常正文/stack、用户输入或凭据。用户不需要点击反馈。每项计数按收到事件数，不声称独立bug数。复用 traceId 派生链接，默认错误时间窗1小时。正常4xx/取消/重试不计入本看板。

### Task 1: 独立 Loki 查询验收

Files: scripts/test-error-dashboard.ts；package.json；.github/workflows/quality.yml。

Consumes: 新看板 JSON 的 targets.expr/queryType；现有 assertLocalDocker。Produces: test:errors 命令及CI集成步骤。

- [x] 写出实际 Loki 合成数据回归：前端2、API1、最终任务失败1、Python1；混入4xx、取消、重试、其他事件和坏JSON，预期只匹配指定事件。
- [x] 看板尚不存在时运行 Node --import=tsx scripts/test-error-dashboard.ts，确认失败。
- [x] 实现临时容器创建、就绪、推送、查询和按归属标签清理；不操作任何业务容器或数据卷。

### Task 2: 看板与导航

Files: observability/grafana/provisioning/dashboards/errors.json、overview.json、runtime.json。

Consumes: 安全日志已有 service/event/status/outcome/fingerprint/traceId 字段。Produces: /d/formula-errors。

- [x] 四类选择器分别过滤 browser.error、http.operation/status>=500、worker.attempt/outcome=failed、recognition.request/status>=500。使用显式JSON字段提取和末尾 **error** 过滤。
- [x] 计数 sum(count_over_time(选择器[$__range])) or vector(0)；明细 line_format 保留JSON式traceId，显示中文来源和已有错误信息。前端按fingerprint聚合，任务按operation/code聚合。
- [x] 总览与日志页增加“自动错误中心”链接。运行 test:errors 验证实际查询行为。

### Task 3: 运行验收与文档

Files: docs/OBSERVABILITY.md、README.md、本计划。

- [x] 写明自动采集范围、非覆盖情况、错误入口、计数口径与链接使用方法。
- [x] 格式检查、类型检查（新增脚本）、告警规则回归、临时Loki测试；通过真实Grafana API验证加载和全部查询，不绕过浏览器审批。
- [x] 文件用途、命令结果和剩余限制记录到本计划，最终说明。

## 实施结果与文件用途

| 文件                                                         | 修改原因                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| observability/grafana/provisioning/dashboards/errors.json    | 新增8面板中文自动错误中心，四类计数、统一摘要、同类分组与已有trace链接。              |
| observability/grafana/provisioning/dashboards/overview.json  | 总览增加错误中心入口。                                                                |
| observability/grafana/provisioning/dashboards/runtime.json   | 业务日志增加错误中心入口。                                                            |
| scripts/test-error-dashboard.ts                              | 临时Loki行为测试，覆盖真实LogQL、正常事件排除、分组、中文摘要和链接提取，按标签清理。 |
| package.json                                                 | 增加npm run test:errors命令，无新依赖。                                               |
| .github/workflows/quality.yml                                | integration任务纳入错误看板回归。                                                     |
| docs/OBSERVABILITY.md                                        | 自动采集范围、入口、操作方式、计数和非覆盖情况。                                      |
| README.md                                                    | 提供错误中心直达链接。                                                                |
| docs/superpowers/specs/2026-11-02-automatic-errors-design.md | 记录用户批准方案和范围取舍。                                                          |
| 本计划                                                       | 记录执行和实际验证结果。                                                              |

## 实际验证

- 看板创建前脚本因文件不存在明确失败；创建后临时Loki查询通过。合成前端异常2、API5xx1、任务最终失败1、Python5xx1；4xx/取消/重试/其他事件/坏JSON不混入。空样本4项计数均为0；10条查询覆盖明细、分组与链路ID提取。
- 真实Grafana API确认formula-errors已装载，8面板；10条实际查询全部200/success，TraceID派生目标为formula-tempo。没有向真实日志写入合成异常。
- test:alerts通过；check:source-format通过；最终类型检查通过（初次测试脚本类型推断问题已加明确返回/行类型）。
- 未改业务采集实现、接口、数据库或依赖；既有7天日志保留和尽力投递边界不变。新增CI步骤尚未推送执行，不能宣称远端通过。

## 未验证与风险

Grafana人工视觉验收仍受已知浏览器自动审批额度拒绝影响，没有改用其他浏览器绕过；本轮完成查询/API与隔离自动化验收。没有新增业务技术债务；界面无异常但行为不符合预期的bug不会被这四类规则自动发现。离线/登录前漏报和未收集原始堆栈是既有边界，不声称已解决。

统计查询在聚合前仅保留必要分组标签，避免trace/request/task标识放大查询期序列数。
