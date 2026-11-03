# 本地日志与 Trace 查询

已接入 Grafana、Loki、Tempo、Alloy 和 Prometheus。

## 启动与访问

在项目根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/observability-secure.ps1
powershell -ExecutionPolicy Bypass -File scripts/observability-dev.ps1 -Restart
```

启动脚本只重载当前项目的 Nuxt 和 Worker；存在排队或执行中的任务时拒绝重载。业务数据库、存储、模型权重不变。

Python 接入使用原有镜像，挂载当前应用源码及专用日志目录，不重新安装模型依赖：

```powershell
docker compose -f compose.yaml -f compose.recognition-observability.yaml up -d --no-deps recognition
```

仅在没有正在执行的识别任务时重载 Python。镜像中的 telemetry.py 随正常镜像构建打包；以上挂载用于当前本机免重建接入。

打开 http://127.0.0.1:3300 ，首页为 Formula AI 运行总览；业务日志在 /d/formula-runtime。当前启用登录并仅绑定回环地址。用户名 admin，密码保存在本机 tmp/observability-secrets/grafana-admin-password；请在本机打开该文件查看，不要提交或转发。已有 Grafana 数据库也通过标准输入重置了管理员密码。匿名数据源查询返回 401。

## 查一次问题

- 首页集中查看 API、Worker、Python 的经过过滤的业务日志。
- 展开一条日志，点击 TraceID 的“查看链路”。
- 或者进入 Explore，选择 Formula Traces，用 Trace ID 查询。
- 从 trace 返回日志可查询同一追踪编号的跨服务记录。

Loki 查询：

```logql
{service=~"formula-.+"} | json | traceId = "完整32位traceID"
```

按请求/任务查：

```logql
{service=~"formula-.+"} | json | requestId = "请求UUID"
{service=~"formula-.+"} | json | taskId = "任务UUID"
```

识别上传与提交共用浏览器操作上下文；其他账号请求有独立 span。HTTP 返回 X-Request-Id 和 X-Trace-Id。HTTP 将 traceparent 放入队列 JSON，Worker 每次执行创建独立 span，并将其传给 Python。生成回答和转换 Word 有独立步骤。旧任务无追踪字段时创建新 trace，并保留原 taskId。

失败时页面出现“复制诊断信息”，内容为 trace/request 编号、静态页面路径、时间、状态码，不包含输入正文。刷新之前复制，发送给开发者。网络请求未到服务端时可能没有 requestId。

幂等键和追踪编号职责独立；客户端确认提交的重试可能使用新 trace，通过原 requestKey/taskId 继续关联已有操作。

## 数据与保留

- API/Worker 安全 JSONL：tmp/observability/formula-api.jsonl 与 formula-worker.jsonl。
- Python 安全 JSONL：同目录 formula-recognition.jsonl。
- 每服务约 5 MiB × 3 个本机文件；Loki、Tempo 保留 7 天。平台数据位于独立的 formula-ai-observability Docker volumes。
- Alloy 仅读取该专用目录中当前 .jsonl 文件，不采集含完整调试输出的 tmp/*.log；轮转可能丢失极端高速写入下尚未读取的尾部，此阶段没有可靠审计投递保证。
- traceId/requestId/taskId 不作为 Loki 索引标签，避免高基数。
- 白名单排除 Cookie、授权码、图片、问题、回答、SQL、存储路径和原始异常；追踪只保留静态操作名、路由模板、状态和任务标识。
- 首轮本机追踪不采样削减；SDK/采集器队列有界，采集故障时丢弃遥测而不中断业务。关页面前尚未送达的浏览器数据不保证持久化。
- 浏览器 OTLP 上报经过登录、同源、32 KiB、最多32 spans、时间/ID/名称校验与每用户60次/分钟的有界内存限流；资源名固定，客户端属性与事件一律删除。客户端数据仍属于不可信诊断信息，不可用于计费或授权。
- Python 采用标准库实现最小 OTLP/JSON 导出，不引入影响 Paddle 依赖的 Python OTel SDK；后续增加自动埋点时应换成正式 SDK。后台最多4个待发批次、1.5秒超时。

## 配置与停用

服务端仅显式设置 FORMULA_OTLP_ENDPOINT 时导出；FORMULA_LOG_DIR 设置安全日志目录。浏览器通过 NUXT_PUBLIC_OBSERVABILITY_ENABLED 启用，采集地址不公开到浏览器；浏览器通过同源认证入口上报。

观测服务停用：

```powershell
docker compose -f compose.observability.yaml stop
```

不会删除数据卷。业务仍可运行；本地日志继续落盘且受轮转大小限制。不要用 down -v 清除已有观测数据。

原始 Nuxt/Worker 开发输出仍在 tmp/observe-*.log，用于本机启动故障；不属于已统一收集的安全业务日志。健康检查、框架内部日志、认证内部日志、容器启动日志也不自动进入业务日志流。成功的轮询请求不反复产生日志，但有请求 span。后续可按需要补充经过脱敏的框架错误与基础设施日志采集。

## Prometheus 与运行总览

运行总览：http://127.0.0.1:3300/d/formula-overview 。Prometheus 本机入口：http://127.0.0.1:9090 。Grafana 的 Formula Metrics 数据源用于指标查询。

启动脚本显式设置 FORMULA_METRICS_ENABLED=true；Worker 本机9464端口、API /api/metrics、Python /metrics供采集。默认关闭时不监听Worker指标端口，API/Python指标返回404。Docker采集API时仅在指标启用后放行host.docker.internal这个开发Host，未关闭Host校验。Python沿用观测Compose覆盖文件，不添加Paddle依赖。

Prometheus每15秒直接采集API、Worker和Python，不经过Alloy，避免重复采集。使用官方Quay镜像 v3.13.5（本轮核实的LTS）；TSDB保留7天或1GB，先达到的限制生效。这不是整个Docker数据卷的硬磁盘配额，WAL和活动数据仍有额外开销。

指标口径：

- HTTP仅统计workspaceRequest包裹的账号业务接口，不含登录认证、遥测和SSE长连接。5xx错误率不把401/403等客户端错误算服务故障。
- 排队/处理中数量来自Worker每15秒只读数据库快照，包含延迟重试。快照失败、超过45秒或Worker采集失败时，积压图隐藏旧值；查看快照成功/更新时间定位。当前配置面向本机单Worker。
- 任务结果计数是进程观察值，重启清零，不作为计费或数据库总量。自动重试不记为最终失败；失去执行权单列。Worker观察到的执行中取消单列并排除任务成功率分母；尚未领取就取消的任务没有执行计数。
- 队列等待使用pg-boss startedOn-startAfter，排除计划退避时间。执行耗时按每次尝试计。
- AI首字指模型首个非空内容片段，不含reasoning；结构化解释可能是JSON首片段，不代表页面已经显示完整解释。生成耗时在结构化结果校验前结束。流中断/失败率包含主动取消，任务成功率另外区分取消。real/mock分别统计。
- CPU、RSS、运行时长分别查看API、Worker和真正加载模型的Python进程；Python运行时长从应用观测模块初始化起算。不是整台电脑或全部Docker资源监控。
- 成功率、分位数没有样本时显示暂无样本，不补成100%或0延迟。速率至少需要两次采集；取消计数为已观察数量。
- 标签只含service、静态路由模板、HTTP方法/状态、任务类型、mode和结果，不把用户、任务、request/trace ID加入指标标签。

Grafana在Windows挂载目录下每30秒轮询看板文件，避免文件事件不触发导致看板停留旧版本。基础告警配置及邮件通知见下文。

## 基础告警与邮件

Prometheus 评估 observability/alerts.yaml，Alertmanager 将告警和恢复通知发送到用户指定的 QQ 邮箱。Grafana 的 /d/formula-alerts 展示 pending/firing 状态；通知历史仍应在 Alertmanager 指标和日志中核实。

当前阈值是本机初始值，需要有真实流量后调整：

| 告警         | 条件与持续时间                                      |
| ------------ | --------------------------------------------------- |
| 服务不可采集 | API/Worker/Python 任一 up=0，2分钟                  |
| 队列快照失效 | 失败或超过90秒未更新，2分钟                         |
| 队列积压     | 有效快照下排队超过10，5分钟                         |
| API错误      | 5分钟至少20请求，5xx超过10%，持续5分钟              |
| 任务失败     | 10分钟至少5个终态，失败超过20%，持续5分钟，排除取消 |
| AI首字慢     | real模式10分钟至少5次，P95超过15秒，持续10分钟      |

同类告警合并，持续故障每4小时提醒；Worker离线时抑制其队列告警。没有流量不触发错误率/延迟告警，快照无效不误报积压。

启动安全脚本会从已有 FORMULA_SMTP_USER / FORMULA_SMTP_PASSWORD 读取 QQ SMTP 配置；FORMULA_ALERT_TO 可设置收件人，默认发给 SMTP 账号。授权码仅写入忽略的本地 secret 文件，通过 Docker secret 挂载，禁止输出环境文件或 Compose 完整渲染结果。邮件只含告警摘要和平台地址，不包含用户输入和日志正文。

本次已实际发送测试告警与恢复通知；SMTP 接受两次通知，失败计数为零。这不等于已核实邮箱收件箱。规则验证命令 npm run test:alerts 使用隔离、无网络、只读 promtool 容器；CI 同样执行。

## 前端异常与诊断

启用浏览器观测时捕获 Vue 错误、window.error、未处理 Promise。仅上报错误类别、标准错误名、静态页面路径、同源脚本文件名、行列、时间和 trace；不上传原始 message、stack、输入内容或完整资源 URL。同类错误60秒去重，最多20条/分钟，批量发送且失败不递归重试。

入口 /api/account/telemetry/errors 要求登录、同源，复用60次/分钟限流和32KiB限制，每批最多10条。登录前和断网时无法保证收集。Vue/framework之外的第三方脚本错误可能没有可用行列。浏览器数据不可信，仅作排查线索。

Loki 中使用 service=formula-browser，或查询事件：

```logql
{service="formula-browser"} | json | event = "browser.error"
```

页面诊断复制中的 trace ID 可关联前端异常 span 和安全日志。原始异常仍应在开发环境控制台查看。

## 容量、备份和恢复

用 docker system df -v 查看各卷占用，并在 Docker Desktop 中查看可用磁盘。Loki/Tempo 的7天保留是时间策略，不是硬容量配额；Prometheus 的1GB不包含所有 WAL/活动块开销。本机安全日志受轮转限制，但其他 tmp 开发日志需要单独检查。建议剩余空间低于20%时人工处理；本轮未部署磁盘告警 exporter。

在项目根目录运行：

```powershell
node scripts/run-node.mjs node_modules/tsx/dist/cli.mjs scripts/observability-backup.ts
```

脚本验证本机 Docker 和卷归属，短暂停止观测服务，备份六个观测卷到 backups/observability/时间目录，生成 SHA256 清单，然后恢复原运行容器。不会停止业务数据库或识别模型。最后将 Grafana 归档恢复到独立临时卷，执行 SQLite integrity_check，仅删除这一个带验证标签的临时卷；历史备份不自动删除。

本轮六卷归档与隔离 Grafana 数据库恢复校验已通过。完整灾备仍须在另一台机器验证六服务启动、历史日志/trace 查询和告警状态。恢复前验证 manifest.json 的哈希，停止目标观测服务，先归档现有目标卷，再将指定归档解压到已确认的目标观测卷；不要覆盖业务卷，也不要直接对运行中卷解压。

备份含 Grafana 数据库与遥测记录，应限制访问并离线保存；本机 Windows 的实际文件保护由 NTFS ACL 决定，Node mode 不代替 Windows 权限。secret 文件与 .env 需单独加密备份，不能放进源码或公开附件。源码内的看板和规则可重新部署。没有设置自动备份计划和自动清理策略。

## 服务器部署前

当前已完成本机访问控制与部署准备，尚未部署服务器域名/TLS。不要直接把本地端口开放到公网。

1. 在服务器只开放业务入口与反向代理 HTTPS；Grafana 经 VPN、SSH 隧道或受控反向代理访问。Loki/Tempo/Prometheus/Alloy/Alertmanager 不提供公网入口。反向代理显式拒绝外部 /api/metrics 访问，仅允许内部 Prometheus 抓取。
2. 使用 base 加 compose.observability-secure.yaml 启动；不要仅使用 base 文件重建 Grafana，否则会恢复开发匿名模式。服务器可用 Node/tsx 执行凭据脚本，再用相同 Compose 覆盖文件启动；PowerShell 包装脚本面向本机 Windows。
3. HTTPS 代理部署后设置 FORMULA_GRAFANA_URL 为实际 HTTPS 地址、FORMULA_GRAFANA_COOKIE_SECURE=true；部署有效证书并验证登录与反向代理路径。当前本机 HTTP 必须保留 false，否则浏览器不会发送 cookie。
4. 更换管理员凭据，邮件地址配置为实际部署通知接收者，平台链接改为实际可访问地址；限制 secret 文件权限。现有本机邮件链接只适用于这台电脑。
5. 配置持久卷、容量检查、异机备份与恢复演练。以上观测备份不替代业务 PostgreSQL、对象存储与模型的备份。
6. 验证匿名请求被拒绝、三项 scrape 为 UP、日志/trace 可查询、一次测试告警及恢复通知被接受。

## 验收范围

隔离浏览器已通过识别、编辑、对话、Word导出、取消、Worker中断恢复，以及 trace 贯通和三类前端异常上报；SMTP、登录保护、监控查询和备份恢复由接口/命令验证。Grafana 人工视觉验收尚未完成：浏览器自动审批因使用额度拒绝打开该页面，未通过其他方式绕过。

## 自动错误中心（用户无须提交）

打开 http://127.0.0.1:3300/d/formula-errors 。运行总览和业务日志页也有“自动错误中心”入口。采集沿用已有观测开关：安全启动脚本启用浏览器、API、Worker和Python相应观测；没有另建反馈表或要求用户点击复制。

顶部四个数字是当前时间范围收到的事件条数：前端未处理异常、已接入账号API的HTTP5xx、Worker任务最终失败、Python /recognize 的HTTP5xx。下方用中文摘要写出来源、错误类型/代码和已有页面/任务/请求信息；展开记录，在 TraceID 字段旁点“查看链路”。其他步骤和同一trace的完整日志可从链路回到业务日志。

前端分组使用已有安全fingerprint，任务失败按任务类型和错误代码分组；统计不是独立bug数或受影响用户数。同一故障可能同时产生Python5xx、Worker最终失败等多个事件，不能把四类相加当作独立问题总数。每类明细默认最多100条，计数按所选时间范围计算。无日志样本显示0，采集不可用时查询报错；0不代表不存在bug。

正常4xx（含表单校验、未登录、资源不存在）、自动重试、主动取消、失去任务领取权不计入这四类错误。纯UI错位、业务结果不符合预期但没有抛错、被业务主动吞掉的异常、登录前浏览器异常和离线丢失等不保证捕获。客户端上报仍是尽力投递，不能代替可靠审计。前端只保留错误类型、静态路由、同源文件/行列和标识，不增加原始message/stack/输入采集。

邮件继续使用既有样本门槛和持续时间告警规则，不是每条错误都发邮件。本轮新增的是集中查看入口和查询分类，已有自动采集没有被改写。

验证命令 npm run test:errors：仅创建带归属标签的临时Loki容器，不挂载业务卷，合成数据不会写入真实平台；实际测试四类计数、空记录、4xx/重试/取消/坏JSON过滤、中文摘要、trace链接提取及同类分组。
