# Formula AI

面向手机使用的数学公式识别与 AI 学习应用。将图片识别为可编辑 LaTeX，保存、分类和收藏公式，再进行结构化解释、连续追问与可编辑 Word 导出。

## 功能与边界

- 账号登录与邮箱验证码注册；账号数据、图片和导出文件隔离。
- JPEG/PNG 上传、裁剪和旋转；Python CPU 模型识别，支持手写与印刷模式。
- 手动创建、编辑预览、搜索分页、分类、收藏与软删除。
- AI 解释和流式对话，支持停止、失败重试、刷新与断网后的状态恢复。
- 独立 Worker 执行识别、对话和导出；请求幂等、每日额度、执行权校验与遗留资源核对。
- Vitest、协议测试、隔离集成测试及 Playwright；可选接入日志、指标、链路与自动错误中心。

Python 模型由协作者提供，本仓库负责服务集成，不包含训练过程和模型权重。真实识别与 DeepSeek 均需单独配置；mock 只用于开发和测试。找回密码、第三方登录尚未实现。旧访客演示代码保留兼容，正常产品入口要求登录。

## 技术组成

Nuxt 4 / Vue 3 / TypeScript、TanStack Vue Query、Zod、Prisma / PostgreSQL、pg-boss、LangChain TS、Python / Paddle、S3 兼容私有存储、KaTeX、Pandoc。可选观测使用 OpenTelemetry、Grafana、Loki、Tempo、Prometheus 和 Alloy。

## 本地启动

需要满足 [package.json](package.json) 中的 Node 版本要求，以及 Docker Compose。建议使用与 CI 一致的 Node 24.22.0。先安装依赖并生成本机配置：

    npm ci
    npm run db:env
    npm run auth:env
    npm run storage:env
    npm run db:up
    npm run db:migrate
    npm run storage:up
    npm run storage:check
    npm run worker:setup

按 [.env.example](.env.example) 配置邮箱；初次体验可显式选择两个 mock 提供方。分别在两个终端运行：

    npm run dev

    npm run worker

打开 http://127.0.0.1:3000 。新账号注册需能接收验证码；真实模型和 AI 接入见下方指南。不要把他人的本机配置或生产数据库复制为开发配置。

## 文档

[完整文档导航](docs/README.md)包含当前架构、接口、前端状态、测试、数据库、存储、模型与排障说明；[架构决策](docs/decisions/README.md)解释主要取舍。

- [开发与格式规范](docs/DEVELOPMENT.md)
- [测试与 CI](docs/TESTING.md)
- [团队协作与审核](CONTRIBUTING.md)
- [单机部署与回退](deploy/README.md)
- [失败恢复](docs/FAILURE_RECOVERY.md)
- [日志、Trace 与错误中心](docs/OBSERVABILITY.md)

## 仓库边界

源码、迁移、锁文件、测试入口、工作流和共享编辑器配置进入 Git。密钥、运行日志、数据库备份、用户文件、模型权重和工具安装不进入 Git。部署包在开发机构建后上传，生产环境不运行开发服务器；单机方案用于小规模试运行，容量须按实际模型和并发测量。
