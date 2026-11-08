# 测试与 CI

## 选择入口

在仓库根目录运行，先安装锁定依赖。测试启动器会清理继承的业务配置，不能为了方便绕过它直接把生产连接传给测试进程。

| 命令                              | 范围与依赖                                                            |
| --------------------------------- | --------------------------------------------------------------------- |
| npm run quality:quick             | 生成、Lint、格式、资源、类型、单元覆盖率、协议与隔离构建/私有配置扫描 |
| npm run test:unit                 | Node 基础设施单测与白名单 Vitest 单测                                 |
| npm run test:vitest               | Vitest 领域、composable 和前端逻辑                                    |
| npm run test:components           | Vue Test Utils + happy-dom 组件测试                                   |
| npm run test:watch                | 单元开发监听                                                          |
| npm run test:coverage             | 已声明 Vitest 范围的覆盖率                                            |
| npm run test:protocols            | 受控 HTTP/SSE 替身协议边界                                            |
| npm run test:isolated             | 新建隔离 PostgreSQL、S3 与 API，执行集成测试并清理                    |
| npm run test:e2e                  | 多页面、多个视口的真实 API/Worker 浏览器旅程                          |
| npm run test:e2e:queries          | Query 筛选、写入、失效、账号切换和回执恢复                            |
| npm run test:e2e:faults           | Worker 退出、断网、回执丢失、前台恢复和失败重试                       |
| npm run test:documents            | Pandoc 文档转换检查，需要工具可用                                     |
| npm run test:recognition-service  | Python 服务边界测试，不以真实权重作为必需条件                         |
| npm run test:alerts / test:errors | 告警规则 / 自动错误面板配置验证                                       |

test:ui 是历史单元入口，不代表启动浏览器。覆盖率只对应已声明的文件范围，不是全仓库覆盖率。通过数量随用例增减变化，不把旧交付记录中的数字当作质量门槛。

## 隔离约束

单元测试由 [unit-files.ts](../tests/support/unit-files.ts)白名单选择，进程清除真实环境和 dotenv，限制网络；不访问开发数据库、对象存储或真实供应商。协议测试仅在受控本机服务上模拟响应。

集成与浏览器启动器使用独立 Compose、临时数据库和存储、唯一环境清单。默认测试 API/数据库/存储端口为 3100/15432/18333，区别于开发的 3000/5432/8333。清单包含运行编号与资源指纹；使用资源前验证身份，不接受远端 Docker 环境冒充本地隔离环境。

每个浏览器文件与视口使用独立环境，防止账号、额度、缓存与限流互相污染。保留正常注册/验证码限流，不为测试放宽生产规则。浏览器测试使用受控 AI/识别替身；真实数据库、Cookie、HTTP、队列、S3 和 Worker 仍参与。它不证明真实模型准确率或供应商可用性。

## 运行方式

推荐使用自动入口：

    npm run quality:quick
    npm run test:isolated

需要浏览器时，先安装项目 Playwright 版本对应的 Chromium：

    npx --no-install playwright install chromium --only-shell
    npm run test:e2e:queries
    npm run test:e2e:faults

定向检查示例（参数为现有启动器支持的 suite、宽度和测试文件）：

    node --import=tsx scripts/test-isolated.ts queries 390 query-library.spec.ts

完整矩阵由 [test-browser-matrix.ts](../scripts/test-browser-matrix.ts)定义，包含移动与桌面视口；新增页面需同时考虑空态、错误、长公式和滚动。浏览器模拟不能替代真实手机键盘及系统杀进程测试。

需要手工观察隔离 API 时：

1. 运行 npm run test:env:create，记下输出的环境清单路径。
2. 在每个相关终端设置 FORMULA_TEST_MANIFEST 为该路径。
3. 一处运行 npm run test:server；另一处运行 npm run test:env:check 和对应测试。
4. 结束后停止该 API，再运行 npm run test:env:stop。

PowerShell 设置示例：

    $env:FORMULA_TEST_MANIFEST = Read-Host '粘贴本次环境清单路径'

集成测试自身管理需要的队列处理，不要另外启动一个开发 Worker 竞争其任务。需要人工启动测试 Worker 时只能使用本次清单和 test:worker，不能连到开发数据库。

## 故障验证重点

- 相同请求键重复提交、请求成功但回执丢失：不增加任务与项目额度。
- Worker 失效后旧执行者不能提交；结果与队列完成一致。
- SSE、停止响应、轮询乱序：快照版本防止回退。
- 断网或切回前台：恢复原任务，保留片段，不自动 POST 新意图。
- 图片写入不确定、引用竞争、删除响应丢失：不误删未知或仍被使用的对象。
- 账号切换和搜索乱序：不展示上一账号或过期查询结果。

项目内幂等与供应商计费边界见[失败恢复](FAILURE_RECOVERY.md)。真实 Python 联调另行运行 recognition:check 或 recognition:verify，会调用真实服务并消耗资源，不能与替身测试混为一谈。

## CI 与报告

[quality.yml](../.github/workflows/quality.yml)在 PR 和 main push 时运行 quick、integration。完整 browser 作业通过手动 workflow_dispatch 的 full_e2e 选项触发；普通提交时跳过是预期行为。

本地质量分阶段日志在忽略目录 tmp/r16-quality；隔离运行清单位于 tmp/r1-test，安全摘要位于 tmp/r16-artifacts。CI 仅上传受控摘要，不上传 .env、Cookie、数据库或原始用户内容。内部目录中的 R 编号只是启动器兼容路径，不再代表文档交付阶段。

测试结束自动清理匹配本次清单、标签和指纹的资源；残留检查使用 test:isolated:cleanup。不要以全局 prune、删数据库目录或删除开发卷代替清理。若检查失败，先查看对应阶段日志，再修复和复测，不以另一轮历史绿灯证明当前改动。
