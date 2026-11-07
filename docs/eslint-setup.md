# ESLint接入与验证（2026-11-06）

已确认：依赖、Nuxt模块和生成配置原本已经存在，直接运行ESLint能报告问题；原package.json没有lint命令，quality:quick与CI没有lint阶段，工作区也没有编辑器配置。不能把“开发服务器正常”当成“通过lint”。

## 文件与职责

- eslint.config.mjs：复用Nuxt生成的Vue/TS及自动导入配置；忽略生成、模型工具、备份、私有日志与测试产物目录；为现有页面fragment、安全过滤、字典清理、回调void及注入式预览脚本写出有范围的规则例外。没有关闭整个项目的错误检查。
- scripts/check-lint.ts：清理凭据环境，以空dotenv执行Nuxt prepare，随后检查整个源码；非零状态传给调用方，警告也阻断；只允许显式--fix参数。
- package.json：增加lint与lint:fix，沿用项目固定Node启动器；保留用户原先新增的ESLint依赖及Nuxt模块。
- scripts/check-quality.ts：新增lint阶段；现有GitHub Actions已经调用该质量命令，因此无需再重复添加CI步骤。
- .vscode/settings.json、extensions.json：推荐ESLint/Vue扩展，启用Vue/TS/JS诊断及保存修复。本机已有dbaeumer.vscode-eslint-3.0.34；未实际操作编辑器窗口确认诊断UI。
- README.md：说明命令、CI、编辑器和格式化职责。
- app/components的AccountChatDraft、AccountExport、AccountExportTask、AccountFormulaEditor、AccountFormulaExplanations、AccountProfileEditor：提升已有import到模块顶部，移除未使用的route；不改请求/界面行为。
- app/components的AccountRecognitionTask、ExportResult、ManualFormulaCreator，app/pages的exports/[id]、library、recognitions/[id]，tests/design-preview/app/pages/__preview.vue：仅自动调整模板属性顺序。
- app/components/MathFormula.vue：仅在既有KaTeX trust:false输出位置注明v-html安全例外。
- app/plugins/tracing.client.ts、deploy/build-release.mjs、scripts/measure-chat-baseline.ts：明确常量、删无用导入、合并重复导入。
- scripts/test-isolated.ts、scripts/worker.ts：移除会被覆盖的初始化；解释启动Promise为停止逻辑预先声明的原因，保留启动顺序。
- server/database/chat-progress.ts、task-queries.ts、server/services/profile.ts、server/worker/chat.ts：合并/提升导入及修正纯类型导入；未更改事务和任务逻辑。
- server/diagnostics/log-sink.ts：将可选size的非空断言改为显式缺省0，保持不存在文件时不轮转的行为。
- server/worker/lifecycle.ts：仅注释说明主动丢弃上游错误cause，避免原始错误进入队列错误信息。
- tests的explanation-api、explanation、input-contract、manual-formula-api、recognition、resources、tracing：导入、常量、无用变量与转义清理；design-preview的check-account-browser/check-chat-browser移除被覆盖的初始化。

用户未提交的AGENTS.md、upload.vue、tutorial.md及依赖安装改动保留；之前本地告警邮件改动也保留。本轮不创建提交、不操作数据库/模型/备份。

## 规则约定

页面多根规则来自Nuxt的页面过渡规范；现有Vue3页面使用fragment且未启用页面过渡，因此只对pages显式允许，不为接lint更改DOM。未来启用页面过渡需重新审视根节点。可选props默认undefined；控制字符正则用于拦截非法输入；有意吞掉的catch和失败流生成器不机械改写。所有例外有具体范围或就地原因。

## 验证

- npm run lint通过：完整源码检查零错误、零警告；命令包含--max-warnings 0。
- 使用ESLint Node API对内存中的Vue/TS样本实测：未使用变量被@typescript-eslint/no-unused-vars（error）拦截，正常样本通过；未修改实际源码制造故障。
- npm run quality:quick全部通过：生成、lint、格式、素材、类型、35项Node基础设施测试＋189项Vitest、24项协议测试、生产构建与私有配置扫描。
- 本轮代码的git diff --check通过（排除用户原有AGENTS.md改动）；全工作区diff检查提示该文件的CRLF尾空白，保留用户原文未修改。

## 限制

本轮不引入开发服务器checker或提交钩子；编辑器诊断依赖扩展启用并打开实际项目目录。未验证真实编辑器红线/保存UI，未跑完整数据库与浏览器回归；改动限于工具接线、声明/导入/模板属性整理。暂不启用全项目类型感知lint规则，类型安全继续由已有typecheck负责；无新业务抽象和数据库变更。

## 前端空行分组补充

用户确认增加逻辑分组空行，不拆多变量声明。eslint.config.mjs在app目录的Vue/TS/JS使用@stylistic/padding-line-between-statements：导入后、函数前后，以及变量声明和执行语句之间留空行；连续声明使用any，不强制每个变量隔开，也不删除用户已有分组。

新增直接开发依赖@stylistic/eslint-plugin 5.10.0，复用Nuxt已经安装的版本，只启用上述单条规则，不启用整套风格配置，不使用ESLint已弃用的核心空行规则。package.json/package-lock.json记录依赖；不增加运行时依赖。Prettier仍负责缩进/换行且保留ESLint补充的空行，VS Code原有保存自动修复配置继续生效。

为满足新规则，自动补齐app中118个文件的空行；执行前后逐文件比对去掉空白后的内容一致，不拆声明、不调整代码顺序、不改业务。没有将规则机械扩展到数据库、Worker和测试脚本。内存Vue样本验证了缺失空行能检出、连续声明保持紧凑、函数/执行语句正确分组，以及ESLint修复→Prettier→再次ESLint不产生循环修改。

本次quality:quick全部通过：lint、Prettier格式、类型、35项Node与189项Vitest、24项协议测试、生产构建及私有配置扫描。git diff --check排除用户原有AGENTS.md换行改动后通过。未操作编辑器窗口验证真实保存事件；内存样本已验证与现有保存工具链规则一致。本轮未跑完整浏览器/数据库回归，前端变化仅为空白。
