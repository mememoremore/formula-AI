# 开发与维护

## 新环境

先按[根 README](../README.md)启动数据库、存储、Nuxt 和独立 Worker。Node 版本要求见 [package.json](../package.json)，依赖以 package-lock.json 为准。安装使用 npm ci，不手动改锁文件解决冲突。

.env.example 是配置模板，不是可直接复制给同事的真实账号配置。db:env、auth:env、storage:env 只生成或补齐缺少的本机配置，不主动替换已有非空值。生成后核对实际服务地址，再运行迁移。修改运行配置通常需要同时重启 Nuxt 和 Worker。

正常产品入口要求登录，注册需要 SMTP 发信；可配置 mock 识别和 AI，不代表可以跳过数据库、认证和队列。真实模型权重需另行获取并只读挂载。各服务启动与排障见[文档导航](README.md)。

## 目录边界

| 目录                              | 应维护的职责                              |
| --------------------------------- | ----------------------------------------- |
| app                               | 页面交互、组件、composables、账号查询缓存 |
| shared                            | 可复用的输入/输出 schema、类型与领域规则  |
| server/api                        | HTTP、身份、输入解析与调用业务服务        |
| server/database、server/resources | 事务、归属、幂等、资源租约                |
| server/worker                     | 受执行权保护的后台任务                    |
| services/recognition              | Python 推理服务与模型协议                 |
| prisma                            | 数据模型和可重放迁移                      |
| scripts、tests                    | 运维/验证入口与测试隔离                   |
| deploy、observability             | 单机发布与可选观测配置                    |

不要为增加技术栈拆服务；优先维护现有模块边界。具体取舍见[架构决策](decisions/README.md)。

## Zod 与校验边界

领域 schema 位于 shared/schemas，相关 TS 类型尽量由 schema 推导。服务端 parser 负责把失败转换成既有业务提示，不能把原始输入和完整 Zod issues 暴露给用户。

新提交的归一化和已持久化回执的原样验证分开。兼容现有资源 ID、UTF-16 长度、trim/NFC 顺序和错误优先级，不因改用 schema 就自动转数字/布尔值。结构化 AI 解释严格拒绝未知字段；普通输入可按既有契约剥离无关字段。

以下校验继续由专门模块负责：请求体字节上限与媒体类型、Better Auth、账号归属、CSRF、Sharp 图像内容、KaTeX 语法、遥测脱敏、SSE/任务状态机、事务与队列 claim。Zod 不能代替这些边界。

## ESLint、Prettier 与编辑器

    npm run lint
    npm run lint:fix
    npm run check:source-format

lint 入口先准备 Nuxt 生成配置，再执行 ESLint，警告也视为失败；不要直接依赖别人工作目录里已有的 .nuxt 文件。ESLint 检查代码问题并按已配置规则修复，Prettier 管理缩进、引号和换行，两者不是相互替代。

共享 .vscode 配置提供保存格式化和 ESLint 修复，开发者仍需在自己的编辑器安装推荐扩展。.editorconfig 和 Prettier 配置保留在仓库。Prettier 使用无分号、单引号和 100 列宽。

前端空行规则分隔导入、独立函数及声明与执行阶段；相关连续声明可紧凑排列。它不会理解全部业务职责，长 composable 仍需人工分组。不要为满足“每行空行”而机械扩大代码。

只整理改动文件时使用：

    npx prettier --write 路径

npm run format 会格式化较大范围，运行前查看改动，避免把个人笔记或无关文件一起提交。check:source-format 主要检查维护中的源代码范围；文档单独使用 Prettier 检查。

## 本地验证与提交

    npm run quality:quick

这包含生成、Lint、源代码格式、资源、类型、单元覆盖率、协议和隔离构建/私有配置扫描。业务或数据库改动再运行对应隔离集成和浏览器检查，入口见[测试指南](TESTING.md)。

修改迁移前评估兼容性；已有迁移不因本机数据库状态而重写。提交前查看 git diff 和暂存区，只提交本次文件。测试报告包含实际运行命令和限制，不把历史通过次数当作当前验证结果。[协作指南](../CONTRIBUTING.md)说明分支与审核规则。
