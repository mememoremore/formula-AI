# Formula AI

按 Figma「手写」实现的手机优先 H5。已有账号权限、私有图片上传、公式与版本保存、公式库、分类、收藏、搜索、任务队列、每日额度和可编辑 Word 导出。账号图片识别支持独立 Docker Python 服务，解释与追问使用 LangChain TS + DeepSeek，来源通过私有配置明确选择。访客保留模拟演示；真机与WPS仍待实测。

## 开始运行

Nuxt 固定为 4.6.2，Prisma 为 7.10.1，Better Auth 为 1.7.12。Node 版本要求：22.x 至少 22.22.3，24.x 至少 24.15.0，或 26+。

请安装符合要求的 Node。启动脚本也支持本机 `.tools/` 中的便携版，但该目录不纳入 Git，其他电脑不能依赖它已经存在。

```powershell
npm ci
npm run dev
```

打开终端打印的地址，默认 `http://127.0.0.1:3000`。开发服务器仅监听本机。

工程无需 `.env` 或数据库即可预览。若国内默认 npm 镜像不可用，可在安装命令加 `--registry=https://registry.npmjs.org`，无需修改系统 npm 设置。

体验真实上传和账号保存，先启动数据库与私有存储：

```powershell
npm run db:env
npm run auth:env
npm run storage:env
npm run db:up
npm run db:migrate
npm run storage:up
npm run storage:check
npm run worker:setup
npm run dev
```

另一个终端运行 `npm run worker`，消费识别、对话和导出任务。打开 `/login` 创建自己的账号，进入 `/upload` 上传图片；个人中心在 `/profile`，公式库在 `/library?space=account`，最近识别和收藏分别使用 `view=recent`、`view=favorites`。旧 `/account/*` 地址仍保留兼容跳转。种子用户没有密码，不能直接登录。

```powershell
npm run typecheck
npm run build
npm run preview
```

`npm run preview` 启动构建后的应用。`npm run test:unit` 可以独立执行；`test:api` 等集成测试必须使用下文 R1 的专用隔离环境，不能连接普通开发或预览服务。

## 先看这些文档

- [Docker模型服务操作手册](docs/Docker模型服务操作手册.md)：模型目录、镜像构建、配置、启动、验证和故障排查。
- [第11天Docker模型接入开发说明与验收记录](docs/第11天Docker模型接入开发说明与验收记录.md)：代码位置、兼容性处理、架构取舍及实际验证。
- [第12至13天开发说明与验收记录](docs/第12至13天开发说明与验收记录.md)：DeepSeek + LangChain TS、流式恢复、停止与通用推理故障处理；已完成一次真实DeepSeek短答联调。
- [DeepSeek配置与联调手册](docs/DeepSeek配置与联调手册.md)：私有环境配置、启动与真实联调。

- [文档导航](docs/文档导航.md)：中文文档入口，按用途和阶段查找。
- [第10天开发说明与验收记录](docs/第10天开发说明与验收记录.md)：弱网、重复提交、超时、小屏幕及相关修复。
- [Python模型接入交接清单](docs/Python模型接入交接清单.md)：给模型开发者的材料和接口清单。
- [第8至9天开发说明](docs/第8至9天开发说明.md)：可靠任务、对话、额度、Word 导出及代码文件对应关系。
- [后台任务与导出操作手册](docs/后台任务与导出操作手册.md)：Worker 启动、Pandoc 配置和故障排查。
- [第8至9天验收记录](docs/第8至9天验收记录.md)：88项检查、Word 实际编辑与浏览器流程。
- [第7天开发说明](docs/第7天开发说明.md)：公式库、分类、收藏、分页、搜索和代码对应关系。
- [第7天验收记录](docs/第7天验收记录.md)：接口、并发、刷新与浏览器验证。
- [第5至6天开发说明](docs/第5至6天开发说明.md)：真实上传、S3、图像校验、幂等、版本与历史。
- [私有对象存储操作手册](docs/私有对象存储操作手册.md)：启动存储、配置、状态排查与切换服务。
- [第5至6天验收记录](docs/第5至6天验收记录.md)：上传、权限、并发和浏览器验证。
- [第4天开发说明](docs/第4天开发说明.md)：登录流程、认证表、权限策略、选型与代码位置。
- [第4天验收记录](docs/第4天验收记录.md)：两个真实用户的隔离及会话验证。
- [数据库与架构设计说明](docs/数据库与架构设计说明.md)：ER 图、十六张应用表、归属与版本设计、关键选择及取舍。
- [前端页面与文件对照](docs/前端页面与代码导览.md)：每个页面对应哪个文件，导航、组件、样式和状态在哪里修改。
- [API 协议与模拟边界](docs/接口协议说明.md)：首日可调用接口、类型、错误及真实服务接入位置。
- [数据库操作说明](docs/数据库操作手册.md)：启动、迁移、种子、查看数据与后续改表。
- [Day 3 验收记录](docs/第3天验收记录.md)：真实数据库检查及当前完成边界。
- [验收记录](docs/第1天验收记录.md)：检查结果和当前限制。
- [原始 15 天计划](十五天开发计划.md)。

## 目录

```text
app/
  pages/             路由对应的页面
  components/        共享界面组件
  composables/       响应式演示状态与业务操作
  layouts/           页面框架与导航挂载
  plugins/           本机演示存储恢复与保存
  assets/css/        设计变量与通用样式
  utils/             存储解析、错误文案
shared/
  types/             前后端共享类型
  demo/              固定演示样例
server/
  api/               Nitro 业务 API
  database/          Prisma 连接和公式数据操作
  auth/              认证配置与工厂
  storage/           私有 S3 适配器
  images/            图像检查和规范化
  middleware/        私有响应缓存策略
  generated/         自动生成的 Prisma Client，不纳入 Git
  recognition/       Python识别服务配置和HTTP适配器
  services/          识别协议、模拟实现与上传业务
  utils/             请求校验
docs/                开发文档
services/recognition/ 独立Python识别服务与Docker镜像定义
tests/               认证权限、API、数据库与私有配置检查
prisma/              数据模型、迁移和开发种子
scripts/             本机配置和数据库检查
```

## 当前边界

- 登录后图片真实上传至私有存储，结果和版本写入数据库；未登录的本机演示只发送元信息，不上传内容。
- 访客识别返回固定 LaTeX；账号根据配置调用 Python 或显式模拟。模型没有可靠置信度时不展示分数；账号 AI 支持 DeepSeek 流式回答。
- 演示页面的公式、版本、分类、收藏及最近 10 轮对话仍使用浏览器 localStorage，不会自动导入账号。
- 账号图片、公式、版本、识别历史、分类和收藏可刷新读取；公式库支持分页及标题/当前 LaTeX 文本搜索。独立 Worker 调用所选识别适配器，保存实际结果与模型版本；对话、任务状态和日额度也已接入数据库。
- 尚未配置邮箱验证、找回密码和第三方登录。账号详情已可导出指定版本的可编辑 Word；访客示例不导出。反馈仍仅可复制。
- 代码未发布到线上。请勿将首日模拟 API 当作正式生产 API。

## R1 安全测试入口

测试不再加载开发 `.env`，集成测试必须显式提供专用环境清单；缺失配置直接拒绝执行。请先阅读 [R1 测试隔离与验收说明](docs/R1测试隔离与验收说明.md)。`npm run test:unit` 可独立执行，集成测试不能直接复用正在运行的开发服务。`test:ui` 是逻辑测试，不代表浏览器视觉验收。

## GitHub 源码范围

发布保留开发与重构提交历史、源码、锁文件、配置模板和文字文档。`docs/设计稿/`、`docs/验收证据/`及阶段验收 JSON 属于本机过程材料，不随 GitHub 源码发布；阶段报告中的这些素材路径仅供持有本地证据时查阅。运行界面的必要 SVG 位于 `public/images/`，仍随源码提供。

密钥、数据库/对象存储数据、便携工具、生成目录和模型权重不进入仓库。Python 服务代码和模型配置说明保留；真实权重需另行提供，并按模型手册配置挂载路径。源码发布不等于已部署生产环境，也不会自动运行模型或执行迁移。

## 服务端配置

`.env.example` 只包含开发示例值。真实凭据放本地 `.env` 或部署环境，文件已被 `.gitignore` 排除。

数据库地址、认证配置、私有对象存储配置、识别及 AI 密钥定义在 `nuxt.config.ts` 的私有 `runtimeConfig` 中；`public` 仅含应用名称。生产 Node 服务不会自动读取工程目录的 `.env`，部署时需注入对应环境变量。
