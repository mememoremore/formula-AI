# R16 自动化测试、CI 与真实业务验收

本轮基于 R15 `fdf83626ece04d5742b3fe4044a77f07b2d9f10a`，分支 `refactor/r16-quality-e2e`。本机验收日期：2026-10-28。没有推送或部署，没有修改 Schema、增加迁移、访问开发数据库或调用付费模型。

## 1. 审查结论和保留的实现

继续使用 `scripts/test-suite.ts`、Node test runner、R1 manifest/容器身份/API 证明/网络守卫。保留原有 203 项集成断言及其串行消费规则，没有另建单元框架、删除失败项或降低事务保护。

原有浏览器能力主要依赖全局 playwright-cli 和设计 Mock，不能证明干净 CI 的真实业务链路。本轮锁定开发依赖 `@playwright/test@1.64.1`，调用生产的三个任务处理器；仅外部识别和聊天模型采用测试适配器。

已补齐：自动资源创建、Prisma 生成和既有迁移部署、API 证明、独立 Worker 启动、真实浏览器链路、故障注入、自有进程清理、部分创建失败清理、源码质量门禁和 GitHub Actions。没有修改页面或业务事务；生产源码唯一 Diff 是 `conversation-queries.ts` 的格式调整。

## 2. 测试分层与命令

所有命令从项目根目录执行。Node 使用 24.22.0；本机包装器会选择已有便携 Node，CI 使用 setup-node。首次浏览器测试显式安装：`npx --no-install playwright install --with-deps chromium --only-shell`；Windows 可省略 `--with-deps`。

| 层级         | 命令                                                                                       | 资源与用途                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 快速门禁     | `npm run quality:quick`                                                                    | Prisma generate、源码格式、资源、完整类型、97 单元、21 本机协议、生产构建与客户端私有扫描；不连接业务 DB   |
| 模块回归     | 原有 `test:jobs`、`test:resources` 等                                                      | 保留，必须显式使用已核验 R1 manifest/API；不能当作自动环境创建命令                                         |
| 完整集成     | `npm run test:isolated`                                                                    | 自动新建 R1 PostgreSQL/S3、部署现有 9 个迁移、启动 API、运行全部 203 项、清理                              |
| 真实 E2E     | `npm run test:e2e`                                                                         | 320/390/430/1440，每个视口使用独立 DB/桶/API/Worker；不是 HTTP 成功响应 Mock                               |
| 定向 E2E     | `node scripts/run-node.mjs node_modules/tsx/dist/cli.mjs scripts/test-isolated.ts e2e 320` | 支持 320/390/430/1440，用于受影响链路验证；不得把单视口结果称为全矩阵                                      |
| 慢速故障     | `npm run test:e2e:faults`                                                                  | 真实请求回执丢失、停止、模型故障、Worker 进程退出、重试/UNKNOWN、离线重连                                  |
| 文档专项     | `npm run test:documents`                                                                   | 7 项，必须有 Pandoc，验证真实原生公式 DOCX                                                                 |
| 创建失败证明 | `npm run test:isolated:cleanup-proof`                                                      | 两容器就绪后、迁移前注入中断，核验安全清理                                                                 |
| 清理回退     | `npm run test:isolated:cleanup`                                                            | 本机必须显式指定本次 manifest；无 manifest 时拒绝。只有 GitHub Actions 的新工作区允许扫描本 job 的运行清单 |

集成与 E2E 使用相同固定测试端口，不要在同一宿主并行运行。协议组使用动态回环端口，模型 SDK 的真实 HTTP 行为由本机协议替身测试。测试会删除自己在隔离桶中创建的测试对象，不触碰用户存储。

## 3. CI 工作流与安全边界

`.github/workflows/quality.yml`：

- PR、main 变更：快速门禁和完整隔离集成两个独立 Ubuntu 24.04 job。
- 手动 `workflow_dispatch` 勾选 `full_e2e`：额外运行完整四视口 E2E 和故障组。
- 使用锁文件、`npm ci --ignore-scripts`；显式 Prisma 生成，避免依赖安装阶段隐式运行项目脚本。
- CI 显式 apt 安装 Pandoc，显式安装匹配锁定 Playwright 的 Chromium；不依赖本机 `.tools` 或绝对路径。
- checkout/setup-node/upload-artifact v6 的 SHA 已通过官方仓库 `git ls-remote` 核验，固定为 40 位提交；`contents: read`、`persist-credentials: false`。
- 不读取生产 Secrets，不使用 `pull_request_target`，不部署、不推送历史、不执行生产迁移。
- PostgreSQL 17-alpine、SeaweedFS 4.48 的测试镜像固定至本机已核验 RepoDigest；生产 Compose 未修改。
- job 超时与并发取消受控；运行器 finally 清理，工作流 `always()` 再核验容器清理。宿主断电/SIGKILL 无法保证 JS finally 执行，托管 runner 仍是最后隔离边界，不能把本实现当作任意自托管宿主的无条件回收器。

**远端工作流未推送、未在 GitHub Actions 执行。** 已完成的是本地配置、静态安全策略测试和本机真实链路；Linux apt、Docker digest 拉取、Actions 缓存/取消行为仍需远端首次运行确认。

## 4. Fail-Closed 与生命周期

`test-isolated.ts` 先检查本机 Docker、端口、随机运行身份和资源配置，再创建 tmpfs 容器。迁移前检查标签、完整容器 ID、端口、凭据目标及挂载。API 身份证明成功后才启动测试/Worker；模型提供方固定为 Mock，Node 网络守卫拒绝开发默认端口和外部服务。

每次 API 使用运行目录下独立 Nuxt buildDir，避免旧锁和 PID 重用。曾实际遇到旧 PID 被 Windows 分配给其他程序：没有停止该程序，而是修复测试目录隔离。

Worker 通过 IPC 回报匹配 runId 的 ready 后才运行浏览器；只对明确的受控退出码 86 有限重启。Windows 清理只针对仍由本运行器持有的子进程树；Worker 支持 IPC 关闭并停止恢复循环、pg-boss 与 Prisma。API 不按端口查找和杀进程。

清理先核对所有容器候选，再删除自己的 tmpfs 容器及已空的专用网络；拒绝开发标签、bind mount、替换 ID、重复服务。支持部分创建和已停止容器，但正常测试身份守卫仍要求资源运行中。原始 manifest 保留在忽略目录便于追查。

安全摘要在清理后写入，含组别、视口、退出码、清理结果、重启次数和耗时，不含 URL、Cookie、错误对象或环境变量。清理不确定时退出码为 1，不能发布“通过”凭据。

实际证据：

- 缺少/冲突配置的既有测试继续通过；新增部分创建、停止容器、标签、挂载和替换校验。
- 创建中断证明：迁移、API 和队列未启动，2 个专用容器清理成功，约 8 秒。
- 本机未指定 manifest 的清理命令返回 1；对同一已清理 manifest 重复执行返回 0、移除 0 个。
- 多次真实浏览器断言失败后，运行器均完成自身容器清理；没有放宽业务断言使测试通过。

## 5. 真实业务覆盖

| 链路        | 真实执行内容与断言                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A 识别/公式 | 浏览器注册、Session 身份确认、PNG 选择和预览、Sharp/S3 上传、202 识别、pg-boss Worker、详情、修订内容与名称、v1 历史、收藏、分类、返回公式库                     |
| B 聊天      | 选择已保存 v1、首次发送创建会话、真实队列消费、数据库快照 SSE、两轮问答、刷新恢复；调用审计成功、Mock 用量为 null                                                |
| C DOCX      | 从已有 v1 导出，生产导出 Worker + 真实 Pandoc + S3 下载；解压 `word/document.xml` 验证旧 LaTeX、OMML，排除 v2 内容                                               |
| D 权限      | A 退出、B 注册并确认身份；A 的公式、图片、会话、导出任务及下载拒绝访问；B 退出、A 登录后原记录恢复                                                               |
| E 异常      | 创建会话的真实 POST 已提交后丢弃响应，用原意图重试仅生成 1 会话；失败/停止后追问、可重试错误、真实 Worker exit(86)、有限重启、队列恢复、浏览器离线期间完成后重连 |
| 公共体验    | 四视口横向溢出检查、固定输入区实际操作、详情深链接、浏览器后退、404 文案和返回首页                                                                               |

四视口均使用真实 API 和独立资源；分类创建使用带合法 Origin 的真实 API，再通过分类弹窗操作。图像内容和模型输出为测试数据，不宣称识别准确率或真实 DeepSeek 的质量。

故障组的 6 个用户问题只计 6 次 CHAT 额度；可重试故障和进程崩溃各产生第二个 attempt。崩溃的旧调用被核对为 UNKNOWN，新 attempt 成功，业务任务仅一份。受控模型只保存 Prompt 角色/内容 SHA-256 证明，不保存完整 Prompt；验证失败/停止问题不进入后续上下文、当前问题仅出现一次、已成功问答顺序正确。

停止业务任务的实际契约为 `FAILED + 已停止生成。`，调用审计另有 CANCELLED；测试保留这一区分，没有新增状态。SSE 离线通过浏览器 context offline 注入，后台仍真实运行；它不等于生产网络分区。

R12—R15 的容量争夺、补偿失败、清理竞争、多 Worker、失效执行者、revision、一致快照、调用审计和租约调度继续由完整 203 项隔离集成覆盖，未与常驻 E2E Worker 混跑同一队列。

## 6. 实际执行结果

| 命令/检查                              | 结果           | 本机耗时/范围                                                                                       |
| -------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| `npm ci --ignore-scripts` 独立源码副本 | 通过           | 761 包，约 3 分钟；无 `.env`/`.tools`/开发数据，显式提供支持的 Node 运行时                          |
| `npm run quality:quick`                | 全部通过       | 生成 1.5s、格式 4.2s、资源 0.2s、类型 18.6s、单元 5.1s、协议 1.8s、构建/扫描 35.6s                  |
| 干净源码副本的同一快速门禁             | 全部通过       | 生成 1.8s、格式 6.0s、资源 0.2s、类型 24.1s、单元 6.4s、协议 2.2s、构建/扫描 37.9s                  |
| 单元                                   | 97/97          | 原有 93 + 清理保护 2 + CI 安全策略 2；未跳过                                                        |
| 本机 HTTP 协议                         | 21/21          | 受控 HTTP，真实 LangChain/识别适配器；普通受限沙箱曾网络失败，允许回环网络后通过，没有改业务代码    |
| `npm run test:isolated` 最终轮         | 203/203        | 用例约 143s；含创建/API/清理总计约 167s，9 个既有迁移仅部署至新测试库                               |
| `npm run test:documents`               | 7/7            | 约 1s，真实 Pandoc                                                                                  |
| 四视口最终矩阵                         | 4/4            | 含清理的凭据：320 46.2s、390 48.3s、430 51.5s、1440 76.9s；桌面轮并行进行了干净副本检查，非性能基准 |
| 最终 Worker IPC 故障回归               | 1/1            | 约 88.7s 含清理，重启 1 次，未调用付费服务                                                          |
| Worker 启动/关闭变更后定向 320 回归    | 1/1            | 约 48s 含清理，保留完整 A–D/404/返回断言；没有为测试工具变化重跑所有历史页面                        |
| 类型/修改源码格式/`git diff --check`   | 通过           | 新 Playwright 配置和 fixtures 已纳入现有 tests 类型范围                                             |
| 生产构建 + 客户端私有扫描              | 通过           | 每次使用当前源码指纹和 147 个客户端文件哈希，不以旧构建冒充成功                                     |
| 旧全仓 `format:check`                  | 失败，明确保留 | 只剩 AGENTS.md、Formula重构.md 两份历史治理文档；源码/执行配置门禁通过                              |

上表为成功的有效运行；开发中出现过 hydration 过早点击、带版本号按钮/下拉框定位、缺少 Origin、等待上一轮回答、未确认 B 身份、同库注册频率、误用停止状态等测试失败，均保留私有日志并修正测试等待/契约。没有删除原断言；四视口改为独立资源，保持真实限流。

成功测试只输出阶段摘要，详细日志位于 `tmp/r16-quality/` 和 `tmp/r1-test/<runId>/`。四视口不生成成功截图；失败保留遮罩截图及本机 Trace。没有可审计的模型 Token 消耗统计，因此不虚报节省比例。

## 7. 文件与职责

| 文件                                      | 修改原因                                                            |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `.github/workflows/quality.yml`           | PR 快速/集成及手动慢速门禁，最小权限和摘要产物                      |
| `package.json`、`package-lock.json`       | 锁定 Playwright 开发依赖，增加分层命令；未替换技术栈                |
| `compose.test.yaml`                       | 测试镜像固定 digest                                                 |
| `scripts/check-quality.ts`                | 顺序运行快速门禁，详细输出留私有日志                                |
| `scripts/check-source-format.ts`          | 明确运行源码/配置的格式范围，保留历史材料                           |
| `scripts/test-generate.ts`                | 干净环境显式 Prisma generate，不读根 `.env`                         |
| `scripts/test-environment.ts`             | 导出受控创建/API 启动，兼容原 CLI，私有 setup 日志及中断检查点      |
| `scripts/test-isolated.ts`                | 自动生命周期、API/Worker 就绪、限定故障重启、自有进程清理、最终摘要 |
| `scripts/test-browser-matrix.ts`          | 逐视口全新环境，保留真实限流，显式冲突变量继续交给 R1 拒绝          |
| `scripts/test-cleanup.ts`                 | 完整身份复核、tmpfs 清理、CI 兜底；本机必须明确清单                 |
| `scripts/test-suite.ts`                   | 仅增加 CI 策略单元组成员，203 集成列表不变                          |
| `tests/support/cleanup-plan.ts`           | 可无真实 I/O 验证的删除授权计划                                     |
| `tests/support/test-environment.ts`       | 显式区分运行核验与停止容器清理核验，未降低正常守卫                  |
| `tests/support/test-runtime.ts`           | 仅创建失败清理可读取未登记容器的 manifest，仍核对目录和环境         |
| `tests/runtime/nuxt.config.ts`            | 每个 run 的独立构建目录，兼容 Nuxt 自身内部标志                     |
| `tests/test-environment.test.ts`          | 部分创建/身份不符等清理保护回归                                     |
| `tests/ci-policy.test.ts`                 | SHA/权限/无生产操作/摘要发布白名单回归                              |
| `tests/e2e/playwright.config.ts`          | 单 Worker、失败即停、失败 Trace 私有保留                            |
| `tests/e2e/browser.ts`                    | 等待真实 Nuxt hydration，不用任意延迟或重复点击                     |
| `tests/e2e/worker.ts`                     | 独立真实消费者，生产处理器/恢复循环，受控模型和 IPC 就绪/关闭       |
| `tests/e2e/journey.spec.ts`               | 四视口真实 A–D、预览/返回/404/权限                                  |
| `tests/e2e/faults.spec.ts`                | E 故障链路、Prompt 哈希、额度/尝试/重连证明                         |
| `server/database/conversation-queries.ts` | 仅 Prettier 排版，无查询语义变化                                    |
| 两份 R16 中文文档                         | 审查计划与本验收说明                                                |

## 8. 产物、Git 与恢复

原始 Trace 仍可能含认证请求参数，即使关闭 snapshots/network 也不能当作已脱敏文件。所有原始日志/manifest/下载/Trace 均忽略，不进入 Git；CI 只上传固定字段 `tmp/r16-artifacts/**/summary.json`。失败截图遮罩所有输入和测试邮箱，仅本机保留。POSIX 设置私有权限；Windows 权限还依赖用户目录 ACL，未进行独立 DACL 加固。

本轮只在 R16 本地分支提交。源码与文档提交、最终过滤 HEAD 见当前会话；不自动推送。恢复用 R16 提交的逆向提交，或在独立目录检出 R15 基线，不对现有工作区执行 reset/clean。

发布继续使用 fast-export 路径过滤副本，排除设计/验收图片及验收 JSON，保留重构历史；本地原始历史不变。过滤后逐路径/blob 验证树一致、扫描历史敏感配置、核对 R15 过滤基线 `cb150e5d1593aa533ac79f7b5a152999d12c34af` 的祖先关系。原始分支禁止直接推送，远端若前进必须重新核对后再申请同步，不能 force push。

## 9. 未验证与 R17 前置

- 未运行远端 Actions、Linux 专属真实 SIGKILL/宿主中断/apt 流程、真实 iPhone/Safari/Android 软键盘；Chromium 的手机视口不能代替真机。
- 没有重跑 R3—R10 全部设计 Mock/截图；这次执行受影响真实链路，不以 Mock 全绿代替端到端。
- 没有真实付费供应商、Python 权重模型准确性或真实生产网络分区测试；未知费用、恰好一次计费不作保证。
- 无负载/压力/SSE 多连接容量基准；R17 需在候选部署环境测内存、磁盘、Pandoc/模型并发与队列压力，再制定承载目标。
- 独立源码副本已验证安装和快速门禁；完整 Docker/E2E 在本机项目根使用 R1 隔离资源执行。CI 的独立 Linux 联调仍待首次远端运行，不混淆二者。
- `npm audit` 实际报告 8 low、1 high（间接依赖 node-forge），未运行 audit fix 或扩大依赖升级范围。R17 上线前需做影响判断和独立升级回归；本轮不宣称零漏洞。
- 后续需决定分支保护的 required checks、慢速 E2E 发布触发规则、apt/Pandoc 工具链进一步锁定、日志保留及监控告警；本轮不修改 GitHub 仓库设置。

本机 R16 自动门禁与核心业务链路已建立；远端 CI 首次验收仍待授权推送。本轮停止，等待评审，不进入 R17。
