# Formula AI

手机优先的公式学习应用：将公式图片识别为可编辑 LaTeX，核对修改后保存到账号，再进行 AI 解释、连续追问和可编辑 Word 导出。

## 已实现

- 登录后使用应用；新账号通过邮箱验证码验证后登录。当前发信适配 QQ SMTP，保留旧账号兼容策略。
- JPEG / PNG 私有上传、自由裁剪与直角旋转；账号识别支持独立 Python Docker 服务，也可显式配置模拟提供方。
- 手动输入 LaTeX 与实时预览；公式分类、收藏、搜索、分页及软删除。
- AI 结构化解释、自由提问与历史记录；任务支持停止、重试和刷新恢复。
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
- test:ui / test:unit 是逻辑单元测试，不等于浏览器或真实手机验收。
- GitHub push main / pull request 执行 quick 和 integration；browser 仅在手动触发且勾选 full_e2e 时执行，正常跳过不代表失败。

隔离规则见 [测试隔离说明](docs/R1测试隔离与验收说明.md)。运行结果以对应提交的 Actions 和本地输出为准，历史验收记录不代表当前提交全部通过。

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

观测入口为 http://127.0.0.1:3300 ，包含运行总览、Prometheus 指标、统一业务日志、trace 查询、前端异常和 QQ 邮件告警。平台已要求登录，本机凭据与备份操作见下方指南。独立 Compose 启动方式、专用日志目录、诊断复制、保留与停用规则见 [观测使用指南](docs/OBSERVABILITY.md)。默认不启用遥测导出，不依赖监控服务完成业务。

## 文档入口

- [识别核对与修改对照设计草案](docs/识别核对与修改对照设计.md)
- [数据库与架构说明](docs/数据库与架构设计说明.md)
- [前端页面导览](docs/前端页面与代码导览.md)
- [文档导航](docs/文档导航.md)

## 源码与私有资源

.env、数据库备份、运行数据、私有日志、工具安装和模型权重不进入仓库。配置模板使用 .env.example。演示数据、模拟模型和真实提供方的边界需明确区分；部署前还需验证邮件、TLS、备份恢复、额度和服务故障处理。
