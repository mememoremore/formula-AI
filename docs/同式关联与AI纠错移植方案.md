# 同式关联与 AI 纠错移植方案

本次需求：把原小程序的同式关联和图片辅助纠错迁入网页；新增入口为原始图片同一行右端的“图标＋重新生成”，与上方“命名”右对齐。本文记录已核对的原逻辑与具体迁移边界，已按用户确认完成移植，实施与验证记录见文末。

## 已核对的小程序逻辑

来源：`D:/formula/formula-miniapp/pages/result/index.js`、`services/formula-api.js`；后端 `D:/formula/formula-backend/src/formula-equivalence.js`、`ai-formula-equivalence.js`、`formula-repair.js`、`app.js` 与 `test/domain-history-flow.test.js`。

### 同式关联

1. 仅比较当前账号此前真实识别过的公式，不把内置模板当作识别历史。按时间、同批区域顺序选取更早记录，不能反向关联以后识别的公式，避免循环。
2. 优先比较精确公式键，然后进行保守的结构匹配，包括一致变量替换、重复自变量整体代入及标量加乘项顺序。不是“只要恒等式都成立就算同式”；不能把不同物理定律只因具有分式外形而合并。
3. 结构匹配没有命中时，可用 AI 审查候选：最多12条候选；只接受候选列表内的记录、至少0.97置信度、无额外假设、无领域冲突的明确同式结论。无法确定、接口失败或返回不合法时保留独立公式。
4. 显示“发现疑似相同公式”、实际历史公式预览，以及“不同意 / 同意”。必须由用户选择；拒绝后保留独立身份，后续不因相同 LaTeX 强制合并。
5. 同意后共用名称、收藏、分类与对应领域的解释。原图、首次识别内容和每次识别记录仍独立保存。解释按规范化领域复用，数学和物理的解释不会互相覆盖。
6. 编辑或确认纠错后，旧判重决定失效，按新内容重新核对。过期版本、匹配目标变化与跨账号操作均拒绝。

### AI 协助纠错

1. 使用当前 LaTeX、用户填写的1～60字领域、对应公式原图或裁剪图片。多公式只发送当前选择的单个区域，不发送整页替代区域。
2. 单条直接填领域，多条先只显示公式供勾选，再逐条填写领域、排队提出候选。
3. AI 以图中符号结构为主要依据，结合领域给出最小必要修改，禁止为了使等式成立而擅自替换成常见恒等式；看不清返回 uncertain，无需修改返回 unchanged。
4. 候选弹窗对照原公式、建议公式、领域和理由，点击“是”才确认，“否”保留原结果继续下一条。失败时保留原结果；候选有效期15分钟，确认时检查原版本及账号。
5. 原小程序使用可接收图片的 Chat Completions 请求；官方地址与 `deepseek-flash` 配置满足其自动复用条件，其他代理或模型需要独立修复配置。当前网页配置的模型名称同为 `deepseek-flash`，迁移时将实际验证图片请求，不能用纯文本猜测代替图像纠错。

## 网页具体实现方案

- 新增持久化的公式身份关联、判重决定、纠错请求及候选记录；使用增量迁移，保留已有账号、公式版本、识别记录、收藏及历史对话，不自动关联历史数据。
- 将小程序保守匹配算法、候选筛选与严格 AI 输出验证移植为有类型的独立模块；复用项目现有 MathJax、DeepSeek 私有配置、额度与请求超时机制。
- 在新识别结果、公式详情以及批量结果接入判重状态。关联需要用户明确确认，关联后统一解析名称、收藏、分类与领域解释；记录与内容不被物理合并。
- 解释按公式身份、内容快照和规范化领域定位，已有成功解释可复用。旧对话与导出继续使用当时的不可变版本，避免关联后历史上下文被替换。
- 在 `FormulaDetailContent` 的公式 / 原图标签行右侧添加重新生成入口。没有有效原图的手动输入或模拟结果给出原因。多公式结果复用仅显示公式的选择界面，再逐条处理领域与候选。
- 确认修复时追加版本，保留原始识别快照；不静默覆盖已经保存的旧解释和对话。已关联公式的修复先作用于本次识别结果，再重新进行同式关联核对。
- 写操作带预期版本、稳定请求编号及账号校验；候选持久化并设置到期时间，重复点击和确认响应丢失不会重复替换内容。限制并发、调用时长及额度；不自动反复调用模型产生费用。

## 范围与验证

预计涉及新业务模块与接口、Prisma 增量迁移、识别 Worker、详情及批量结果、公式库读写、收藏分类、领域解释及相应缓存。不会修改原小程序目录和模型权重，也不会自动批量合并现有公式。

验证覆盖：精确 / 改名 / 整体代入 / 不同领域反例、拒绝关联后的独立身份、同意后共享元数据和同领域解释、跨账号隔离、关联后编辑与删除、图像纠错的 candidate / unchanged / uncertain、过期和并发确认、重复请求、逐区域图像隔离、模型失败保留原结果、手机与电脑界面、类型检查、Lint 和构建。

## 本轮界面调整

- `app/components/HomeHero.vue`：四个入口默认统一白底，支持鼠标悬停和键盘焦点的主题蓝色高亮，离开后恢复。
- `app/components/FormulaCopyAction.vue`、`FormulaWordExport.vue`：多选卡片只显示复选框和公式，名称 / 编号移除；保留屏幕阅读器的选择标签。
- `app/components/AccountLibrary.vue`：管理公式模式仅显示复选框和公式；正常浏览保持原样。
- `app/components/AccountHistory.vue`：批量选记录时隐藏名称、日期和状态；没有公式的失败记录保留最小预览占位。

界面部分属于局部可逆修改，直接实施。上述同式关联与纠错涉及跨模块数据身份和保存行为，依据仓库 `AGENTS.md` 的“对跨模块或高风险任务，先提出方案并等待确认”，用户已确认本方案，现已应用增量迁移并完成实际功能；未修改原小程序，未自动合并已有公式。

## 实施结果（2026-11-08）

- 详情页“原始图片”一行末尾已添加旋转图标＋“重新生成”，与命名操作右对齐。原图对应本次单个识别任务输入；多公式任务的输入本来就是裁剪区域，纠错只发送该区域。
- 同式关联在详情页及批量结果页自动核对，批量逐条展示候选，明确同意才建立关联，拒绝保留独立身份；精确及保守结构匹配无需AI调用，结构未命中才按候选特征筛选并使用严格AI判断。精确公式键亦复用小程序的数学文本规范化，忽略空白和显示定界差异。
- 小程序实际历史池还包含手动录入记录，网页亦保留此行为，排除内置演示和模拟数据。历史最多检查此前2000条记录、AI最多12条候选；超出窗口只可能少给建议，不会强制合并。
- 名称、收藏、分类按用户确认的身份同步。公式库与分类统计按身份展示一次，每次识别记录、原图和公式版本独立保留。网页沿用现有单分类模型，分类调整同步到关联成员。
- 同领域解释按固定内容版本与规范化领域复用，关联后立即刷新解释历史；不同领域不会混用。已有会话、导出和旧内容版本保持不可变快照。
- 修复先保存候选，点击“是”才追加一个 MANUAL 人工确认版本并标记 `ai-repair`；保留首次识别版本。确认后清除旧判重决定并重新核对；编辑也会解除已不再可靠的旧关联。不会静默改动已有解释内容。
- 批量结果勾选后可重新生成：所有领域逐条填写，候选按顺序核对，“否”保留原式并继续下一条。未知提交保留原请求编号，可继续核对，失败或过期后由用户显式重新生成。
- AI补充判重与纠错沿用现有私有DeepSeek配置和CHAT额度；同领域解释复用不再重复创建任务或扣额度。没有新增依赖，没有下载模型或修改C盘数据布局。

## 实施文件与原因

| 文件                                                                           | 原因                                                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                         | 新增规范身份、判重决定、判重缓存与持久纠错候选模型。                                   |
| `prisma/migrations/202611080004_formula_intelligence/migration.sql`            | 增量新增字段和表，约束账号隔离、状态、唯一请求；自关联外键延迟检查兼容账号级联删除。   |
| `server/formula-intelligence/template.cjs`、`template.d.cts`                   | 复用小程序保守结构匹配算法，提供有类型边界。                                           |
| `server/formula-intelligence/mathml.cjs`                                       | 有界MathJax语法树读取适配，拒绝不支持的命令。                                          |
| `server/formula-intelligence/prompts.ts`                                       | 移植原小程序的同式判断与图像纠错提示词。                                               |
| `server/formula-intelligence/provider.ts`                                      | 私有Chat Completions调用，图像输入、时间限制、响应限制与严格JSON读取，不自动重复调用。 |
| `shared/schemas/formula-intelligence.ts`                                       | 统一领域、编号、决定、AI输出及前后端状态契约。                                         |
| `shared/types/workspace.ts`                                                    | 增加可选身份标识，用于关联后立即刷新共享解释。                                         |
| `server/database/formula-identities.ts`                                        | 同账号身份解析、成员查询、锁及串行冲突重试。                                           |
| `server/database/formula-duplicates.ts`                                        | 历史候选、保守匹配、严格AI门槛、缓存、同意或拒绝的持久决定。                           |
| `server/database/formula-repairs.ts`                                           | 原图校验、额度、候选持久化、到期、预期版本检查、幂等确认及追加版本。                   |
| `server/database/formula-queries.ts`                                           | 输出身份标识，保留当前记录自己的原图和内容版本。                                       |
| `server/database/formulas.ts`                                                  | 同式名称同步；内容编辑后拆分旧身份并重新判重。                                         |
| `server/database/library-mutations.ts`                                         | 收藏和分类对关联成员原子同步。                                                         |
| `server/database/library-queries.ts`                                           | 公式库与分类数量按规范身份计数，避免关联后重复显示。                                   |
| `server/database/formula-batch-mutations.ts`                                   | 批量删除同一身份的成员，并保留重复删除幂等性。                                         |
| `server/database/recognition-batches.ts`                                       | 批量分类同步关联成员。                                                                 |
| `server/database/explanations.ts`                                              | 同版本、同领域解释复用，锁保护并发提交。                                               |
| `server/api/account/formulas/[id]/duplicate-check.post.ts`                     | 当前账号同式核对接口。                                                                 |
| `server/api/account/formulas/[id]/duplicate-decision.post.ts`                  | 带当前及匹配版本的明确关联决定。                                                       |
| `server/api/account/formulas/[id]/repair.post.ts`                              | 带稳定请求编号、领域和预期版本的纠错建议。                                             |
| `server/api/account/formulas/[id]/repair/confirm.post.ts`                      | 候选确认与最新公式读取。                                                               |
| `server/api/account/formulas/[id]/explanations.post.ts`、`explanations.get.ts` | 映射规范身份与固定版本，复用并读取对应领域解释。                                       |
| `server/api/account/profile-stats.get.ts`                                      | 我的公式和收藏数量按身份去重。                                                         |
| `app/components/AccountFormulaIntelligence.vue`                                | 单条同式提示、领域填写、原式与候选对照、确认或拒绝、未知请求恢复。                     |
| `app/components/BatchFormulaIntelligence.vue`                                  | 批量领域填写及逐条候选队列，复用单条纠错流程。                                         |
| `app/components/BatchDuplicateReview.vue`                                      | 批量结果的同式逐条核对，避免确认窗同时弹出。                                           |
| `app/components/AccountRecognitionBatch.vue`                                   | 接入批量同式核对与勾选后的重新生成。                                                   |
| `app/components/FormulaDetailContent.vue`、`app/pages/formulas/[id].vue`       | 放置重新生成入口、接入状态、关联后即时刷新解释。                                       |
| `app/components/HomeHero.vue`                                                  | 四个入口白底、悬停或键盘焦点时主题蓝。                                                 |
| `app/components/FormulaCopyAction.vue`、`FormulaWordExport.vue`                | 多选卡片只显示公式与复选框，保留无障碍标签。                                           |
| `app/components/AccountLibrary.vue`、`AccountHistory.vue`                      | 管理与批量选择状态隐藏名称、分类、日期和状态信息；普通浏览保持原样。                   |
| `tests/formula-intelligence.test.ts`、`tests/support/unit-files.ts`            | 纳入保守匹配反例、候选范围与严格输入的安全自动测试。                                   |
| 本文                                                                           | 原逻辑核对、方案确认、实施清单、验证与风险。                                           |

生成的Prisma客户端已更新。`tmp/intelligence-*.mts` 是本机临时验收脚本，`artifacts/formula-intelligence` 是已忽略的截图证据。

## 已执行验证

- `node --import tsx tmp/run-intelligence-checks.mts`：4个文件27项通过，包含变量改名、整体代入、不同物理关系与不同恒等式反例、候选上限和输入验证。
- `node --import tsx tmp/intelligence-smoke.mts`：真实网页与临时账号验证默认白底/悬停蓝色、同意与拒绝、跨账号隔离、共享名称收藏分类、同领域解释复用、公式多选去名称、手机显示；页面脚本错误0。调用真实DeepSeek图片接口，成功把漏掉平方的 `E=mc` 提出为 `E=mc^2`，确认前不改动、确认后追加版本、重复确认不多建版本，首次识别仍保留。
- `node --import tsx tmp/intelligence-edge-smoke.mts`：本地AI替身验证单区域图片发送、uncertain、unchanged、非法候选拒绝、到期拒绝、版本变化拒绝、并发确认、手动公式关联、关联后删除及重复删除。没有把替身结果当成真实模型测试。
- `node --import tsx tmp/intelligence-bulk-smoke.mts`：本地接口替身验证两条公式分别填领域、按顺序核对候选、拒绝后保留两条原版本、手机弹窗可操作。
- `prisma migrate deploy`：已应用增量迁移；`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`：无结构差异。
- 类型检查和代码规范检查已运行通过；生产构建已通过；重启后批量同式提示、拒绝关联、逐条领域及候选处理再次通过本地接口替身回归。

## 风险、边界与技术债务

- AI只能提出建议，不能保证公式识别或同式判断绝对正确；已有严格门槛和用户确认，错误与不确定结果保留原式。
- 关联不是物理删除识别记录。修改内容会解除旧关联，旧解释、对话和导出的固定版本仍保留，修复不追改旧快照。
- 对历史候选采用2000条窗口，超出窗口可能少提示；当前没有引入全量向量索引。候选表尚未提供定时物理清理，过期候选不能被确认。
- 批量填写领域和后续未提交队列在页面内存中；已经提交的单条候选与请求编号可以恢复，未开始项离开后需要重新选择。
- 没有执行完整CI、全部隔离数据库套件和所有历史端到端测试；只报告实际执行的验证。未进行长期高并发压测。
- 没有新增依赖或重写原有队列；新增了身份同步、候选生命周期与移植算法的维护责任，属于本功能必要的维护范围。

补充文件：server/formula-intelligence/keys.ts 复用小程序的精确公式键规范化与有界缓存；tmp/intelligence-bulk-duplicates-smoke.mts 在临时账号验证批量自动同式提示后继续纠错。

最终验收补记：精确公式键新增测试后，4个文件27项自动测试全部通过；最新服务端 `tsc --project tsconfig.database.json` 退出码0，Vue/项目类型检查与Lint通过。最后一次生产构建成功（42.8MB，输出在D盘）。网页和Worker已恢复；重启后的批量同式提示及逐条纠错回归再次通过，健康接口和账号会话接口均返回200，网页及Worker错误日志为空。测试账号与其数据均已清理。
