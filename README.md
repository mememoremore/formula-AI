# Formula AI

手机优先的公式学习应用：将公式图片识别为可编辑 LaTeX，核对修改后保存到账号，再进行 AI 解释、连续追问和可编辑 Word 导出。

## 已实现

- 登录后使用应用；新账号通过邮箱验证码验证后登录。当前发信适配 QQ SMTP，保留旧账号兼容策略。
- JPEG / PNG 私有上传、自由裁剪与直角旋转；账号识别支持独立 Python Docker 服务，也可显式配置模拟提供方。
- 手动输入 LaTeX 与实时预览；公式分类、收藏、搜索、分页及软删除。
- AI 结构化解释、自由提问与历史记录；任务支持停止、重试、刷新及断网恢复；失败回答可重新生成并保留旧片段。
- 识别、AI、导出任务由独立 Worker 处理，使用每日额度、幂等请求和租约恢复机制。
- 导出当前公式的可编辑 Word 文档；公式、对话及文件按账号隔离。
- 手机端固定识别操作栏；公式库清空搜索恢复当前筛选。

## 当前边界

- 新账号注册需要发信配置；找回密码、第三方登录尚未实现。
- 旧访客演示代码与本机数据保留，但页面入口已移除；旧演示链接转到账号入口。底层兼容模拟 API 不等于正式账号业务 API。
- 公式识别和 AI 可能出错，不提供未经验证的置信度。结构化解释不是数学正确性证明。
- 公式只展示当前内容，编辑直接保存；AI 与 Word 导出无需选择版本。历史任务的内部内容引用保留，确保已有对话与导出不失效。识别核对与修改对照方案未启用。
- 手机视口检查不代替真实手机的键盘、相机与触控验证；Word / WPS 的实际编辑兼容性仍需按目标环境验收。
- 仓库源码不等于已完成线上部署；反馈页面目前提供复制反馈内容。

## 单机部署

Ubuntu x86_64、4核4GB 的试运行配置与离线部署步骤见 [部署说明](deploy/README.md)。复用已有宿主 Nginx/HTTPS，生产数据卷独立于本机。服务器实测和真实邮件/AI 验收仍需完成。

## 本地运行

需要 Docker Desktop / Docker Engine、npm，以及 Node 22.22.3+（22.x）、24.15.0+（24.x）或 26+。CI 使用 Node 24.22.0。识别权重与 Pandoc 需要单独配置，不能依赖维护者本机的工具目录。

首次安装与初始化：

```powershell
npm ci
npm run db:env
npm run auth:env
npm run storage:env
npm run db:up
npm run db:migrate
npm run storage:up
npm run storage:check
npm run worker:setup
```

在本机 .env 中配置注册邮件：

```dotenv
FORMULA_SMTP_USER=your-sender@qq.com
FORMULA_SMTP_PASSWORD=your-qq-smtp-authorization-code
```

这里需要邮箱开通 SMTP 后获得的授权码。当前实现连接 smtp.qq.com:465，启用 TLS。授权码不要提交到 Git；修改配置后重新启动网页服务。

分别在两个终端启动：

```powershell
npm run dev
```

```powershell
npm run worker
```

浏览器打开终端打印的地址，默认 http://127.0.0.1:3000。进入登录页，切换创建账号，填写昵称、邮箱和密码后提交；在下一步输入收到的六位验证码。种子用户没有可直接登录的密码。

主要页面：首页 /、公式库 /library、识别 /upload、手动创建 /formulas/new、AI /ai、个人中心 /profile。未登录访问会跳转登录，登录成功后返回原页面。

真实识别配置见 [模型服务手册](docs/Docker模型服务操作手册.md)，DeepSeek 配置见 [AI 联调手册](docs/DeepSeek配置与联调手册.md)。Word 导出依赖 Pandoc，见 [后台任务与导出手册](docs/后台任务与导出操作手册.md)。生产 Node 服务需由部署环境注入配置，不会自动读取工程目录的 .env。

## ESLint

运行 `npm run lint` 检查Vue、TypeScript与JavaScript；运行 `npm run lint:fix` 修复可自动处理的问题。命令先生成Nuxt的自动导入/ESLint配置，再执行零警告检查，首次安装或CI使用 `npm ci --ignore-scripts` 后也能运行。`quality:quick`及现有GitHub Actions已包含lint阶段。

VS Code已提供推荐扩展和工作区配置：安装/启用ESLint扩展后，保存时执行显式自动修复。ESLint负责静态代码问题及前端逻辑分组空行，Prettier负责缩进和换行；Nuxt开发服务器启动成功不等于通过lint。配置约定与验证见[ESLint接入记录](docs/eslint-setup.md)。

## 检查与 CI

```powershell
npm run quality:quick
npm run test:isolated
npm run test:documents
```

- quality:quick：生成客户端、格式、静态素材、类型、单元测试、协议测试、隔离生产构建与私有配置扫描。
- test:isolated：创建专用 Docker 测试数据库和对象存储，执行迁移、启动测试 API、运行集成测试并清理专用资源。不得连接开发数据库代替测试环境。
- 测试发信使用仅隔离 Nuxt 层加载的本地收件箱替身；账号仍通过真实验证码校验与登录流程。CI 不使用 QQ 授权码、不向真实邮箱发送邮件。
- test:documents：文档转换测试，需要可用的 Pandoc；本机可通过 PANDOC_PATH 指定路径。
- test:ui / test:unit / npm test 顺序执行Node基础设施测试与Vitest逻辑/组件测试；不等于浏览器或真实手机验收。
- test:watch：Vitest监听模式；test:components：只运行Vue组件测试；test:coverage：生成Vitest覆盖率。
- quality:quick的unit阶段包含Vitest覆盖率，并只向CI输出数值摘要；既有集成摘要产物白名单保持不变。
- GitHub push main / pull request 执行 quick 和 integration；browser 仅在手动触发且勾选 full_e2e 时执行，正常跳过不代表失败。

隔离规则见 [测试隔离说明](docs/R1测试隔离与验收说明.md)。运行结果以对应提交的 Actions 和本地输出为准，历史验收记录不代表当前提交全部通过。

## Vitest 单测与组件测试

```powershell
npm test
npm run test:watch
npm run test:components
npm run test:coverage
```

Vitest5.1使用两个显式测试项目：logic运行既有纯逻辑断言；components使用Vue Test Utils和happy-dom挂载聊天输入框、任务状态组件。覆盖空白校验、模型输入更新、中文输入法、Enter/Shift+Enter、发送/停止防重复与状态文案。组件测试使用真实Vue API，图标/装饰子组件采用stub，不启动Nuxt服务。

4个Node专用基础设施测试文件继续使用node:test，数据库、Worker协议及隔离集成测试沿用原运行器；完整用户旅程继续使用Playwright。Vitest测试文件采用白名单，不会通过宽泛glob误运行数据库/E2E。启动器清洗服务凭据，配置不读取根.env；每个worker安装现有网络守卫，禁止公网模型与开发数据库/存储连接。直接运行Vitest也应用worker守卫；日常仍建议使用上面的npm命令。

HTML覆盖率在 `artifacts/coverage/index.html`，JSON摘要在同目录`coverage-summary.json`。统计范围为`app/utils`、`shared`业务工具（排除纯类型）、Query options与已迁移的读取/写入组合函数及上述两个组件与诊断提示组件，未覆盖的模块会如实显示0%；不代表整个应用、数据库或模型准确率的覆盖率。初期不设置任意全局百分比门槛，按失败/恢复与交互边界持续补用例。报告不会提交Git，CI目前只输出数值摘要。

Vue组件测试通过`tsconfig.vitest.json`用vue-tsc检查；后端tsc不重复解析.vue。尚未覆盖所有Nuxt页面/组合函数；后续确需Nuxt运行时挂载时再引入Nuxt专用测试工具。纯DOM组件测试不能证明真实键盘、相机、浏览器布局或滚动行为。

## TanStack Query（三轮迁移）

公式库/收藏列表与分类读取使用 @tanstack/vue-query 5.105.3。每个 Nuxt 实例独立创建 QueryClient，SSR 数据水合到浏览器，不写入 localStorage。账号、列表类型、搜索词和分类共同组成 query key；缓存30秒内视为新鲜，未使用缓存5分钟后回收。查询不自动重试，切回窗口不自动刷新。原有写接口保留，通过统一通知刷新相关读取缓存。

查询透传 AbortSignal；会话身份与组件账号不匹配时停止展示，退出或确认换号时取消查询并清空缓存。读取携带预期账号头，服务器仍以真实会话授权；两者不一致返回403，防止其他标签页换号后错存缓存。401/403隐藏已缓存内容，普通分页失败保留已有公式并允许重试。

运行 `npm run test:e2e:queries`，使用独立 Docker 数据库和存储，以320/390/430/1440px视口验证SSR水合无重复请求、筛选缓存、分页、收藏、编辑、分类共享、换号隔离与写入恢复。真实模型与真实邮件服务不在此测试范围内。查询逻辑和实际组合函数测试包含在 `npm run test:vitest` 与 `npm run quality:quick` 中。

第一轮文件职责与验收记录见 [Query第一轮交付记录](docs/query-round1-delivery.md)。

第二轮将创建、编辑、删除、收藏和分类写入接入useMutation。通用生命周期只负责同步防重复、账号边界、AbortSignal与请求状态；业务组合函数保留明确端点和请求体。写请求不自动重试、不离线排队；成功后按账号更新已有列表并统一失效，组件不重复通知。创建仍通过原有sessionStorage回执重放同requestKey与请求体；编辑保留预期内容/名称的冲突校验。后端writer入口核对可选预期账号头，真实Cookie会话仍是授权依据。

第二轮验证与限制见 [Query第二轮交付记录](docs/query-round2-delivery.md)。

第三轮将诊断复制操作放入页面正常文档流，换页清除旧提示，并去掉分类修改的重复事件链。浏览器矩阵按“测试文件＋视口”分别创建、核验并清理独立DB/S3/队列，保留真实注册与OTP限流；完整矩阵还会运行不带尺寸名称的解释渲染、可观测性及资料表单场景；资料专项在一个独立环境内检查320/390/430/1440px。

`npm run test:e2e:queries`运行4个Query视口旅程；`npm run test:e2e`运行完整浏览器矩阵；`npm run test:e2e:faults`验证故障恢复。需要本机Docker与Chromium；邮件、模型使用隔离替身，不连接开发数据库。定向排查可运行`node scripts/run-node.mjs node_modules/tsx/dist/cli.mjs scripts/test-isolated.ts e2e 390 journey.spec.ts`，文件名必须是tests/e2e中的合法spec，资源边界仍需通过身份校验。

三轮收尾结果见 [Query第三轮交付记录](docs/query-round3-delivery.md)。

## Zod运行时校验

固定直接依赖Zod4.6.7，输入规则放在shared/schemas，服务端通过server/services/parse-input.ts将safeParse失败转换为已有WorkspaceError(400)。只向用户返回已定义业务提示，不返回原始输入或Zod issues。

第一轮覆盖公式创建、编辑、收藏、分类创建/改名/分配和公式库查询参数。共享payload类型从schema推导，前端mutation只导入类型；请求体大小/JSON读取、认证/CSRF/归属、事务和幂等仍由原业务负责。创建的KaTeX专用校验单独引用既有manualFormulaFeedback，不改变编辑接口的旧结构契约。

为保持兼容，继续使用旧资源ID格式、UTF-16长度及原trim/NFC顺序；不会自动coerce字符串布尔值或数字。单测覆盖多错误优先级、Unicode长度、原始预期标题、未知字段与安全错误；隔离HTTP测试检查真实状态码/提示及认证/归属优先，定向Query浏览器检查正常保存/分类/收藏与回执重放。

第一轮文件职责与验证见[Zod第一轮交付记录](docs/zod-round1-delivery.md)。第二轮将任务提交、资料与历史查询输入，以及结构化AI解释和Python识别响应迁入领域schema；保留原有错误提示、归一化、鉴权顺序与重试分类。共享解释类型从schema推导，模型、历史和SSE使用同一规则。详见[第二轮交付记录](docs/zod-round2-delivery.md)。第三轮完成旧演示接口、创建回执与资料表单复用，并明确保留遥测脱敏、图片内容、SSE状态机及认证库的专用校验。恢复回执使用原样schema，服务端新建才归一化，避免重放body被改写。最终文件、边界与验证见[第三轮交付记录](docs/zod-round3-delivery.md)。

## 工程结构

| 目录                  | 内容                                           |
| --------------------- | ---------------------------------------------- |
| app/                  | Nuxt 页面、Vue 组件、状态与移动端样式          |
| shared/               | 类型、公式与导航规则                           |
| server/               | API、认证、数据库、私有存储、推理适配与 Worker |
| services/recognition/ | Python 识别服务                                |
| prisma/               | Schema 与迁移                                  |
| tests/                | 单元、协议、隔离集成与浏览器测试               |
| scripts/              | 配置、服务、检查和测试启动器                   |
| docs/                 | 操作说明、设计与历史验收材料                   |

## 本地日志与 Trace

观测入口为 http://127.0.0.1:3300 ，包含运行总览、Prometheus 指标、统一业务日志、trace 查询、前端异常和可选的 QQ 邮件告警（本地默认关闭）。平台已要求登录，本机凭据与备份操作见下方指南。新增 [自动错误中心](http://127.0.0.1:3300/d/formula-errors)，集中查看自动收集的前端、API、任务和Python错误，无须用户提交反馈。独立 Compose 启动方式、专用日志目录、诊断复制、保留与停用规则见 [观测使用指南](docs/OBSERVABILITY.md)。默认不启用遥测导出，不依赖监控服务完成业务。

## 文档入口

- [识别核对与修改对照设计草案](docs/识别核对与修改对照设计.md)
- [数据库与架构说明](docs/数据库与架构设计说明.md)
- [前端页面导览](docs/前端页面与代码导览.md)
- [文档导航](docs/文档导航.md)

## 源码与私有资源

.env、数据库备份、运行数据、私有日志、工具安装和模型权重不进入仓库。配置模板使用 .env.example。演示数据、模拟模型和真实提供方的边界需明确区分；部署前还需验证邮件、TLS、备份恢复、额度和服务故障处理。

失败恢复、额度语义和遗留图片核对/清理操作见 [失败恢复指南](docs/FAILURE_RECOVERY.md)。
