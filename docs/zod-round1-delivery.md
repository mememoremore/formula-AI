# Zod第一轮交付（2026-11-04）

## 实现与兼容边界

Zod4.6.7由已有间接依赖固定为直接依赖。schema只定义外部数据的结构、字段及归一化，parseInput仅负责将安全错误转换为WorkspaceError(400)。HTTP端点仍先认证/CSRF/预期账号校验，编辑和分类分配仍先读本人公式再解析body；请求体读取限制、事务、额度、幂等和归属检查保持各自职责。

创建仍先检查字段类型/请求编号，再执行manualFormulaFeedback，最后trim名称/LaTeX并小写requestKey。编辑不提前trim expectedTitle或版本ID，不新增服务端KaTeX拒绝规则；冲突与专用内容处理仍按原路径执行。分类按trim→NFC→长度/控制字符校验；搜索词按原始长度校验后trim，布尔筛选只接受true/false字符串，输出布尔值。未知字段仍丢弃，不使用coerce。

ID复用旧hex 8-4-4-4-12规则；字符串用refine显式保留JavaScript UTF-16长度，避免库默认UUID或字符串长度规则改变旧客户端行为。schema没有全局错误映射，不返回原始Zod issues。创建schema单独引用KaTeX，前端payload仅type import，未增加一套客户端运行时验证流程。

## 文件与原因

| 文件                                                                                | 原因                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| package.json、package-lock.json                                                     | 固定Zod4.6.7直接依赖，保留原registry与完整性值                                       |
| shared/resource-id.ts、server/database/private-resources.ts                         | 共享旧ID格式，保留数据库身份guard语义                                                |
| shared/schemas/manual-formula-input.ts                                              | 创建结构、专用内容校验与最终归一化                                                   |
| shared/schemas/formula-input.ts                                                     | 编辑预期值/原始长度、严格布尔收藏结构                                                |
| shared/schemas/library-input.ts                                                     | 分类名、分配、列表查询规则与推导payload                                              |
| shared/types/manual-formula.ts                                                      | 保留旧导入路径，类型从schema推导                                                     |
| server/services/parse-input.ts                                                      | 统一安全错误适配，不暴露issues/input                                                 |
| server/services/formula-input.ts、manual-formula-input.ts、library-input.ts         | 保持领域入口和已有提示，去除手写类型断言/结构判断                                    |
| server/api/account/formulas/[id]/versions.post.ts、category.put.ts、favorite.put.ts | 使用类型明确的解析结果，保留原认证/资源/业务调用顺序；PATCH别名继续复用versions.post |
| server/api/account/categories/index.post.ts、[id].patch.ts                          | 复用分类输入schema，数据库内部防御校验仍引用相同规则                                 |
| app/composables/useFormulaMutations.ts                                              | 复用共享编辑/收藏/分类payload类型，不复制请求字段类型                                |
| tests/input-contract.test.ts、tests/support/unit-files.ts                           | 新增12项兼容契约用例并纳入Vitest白名单，最初6项在旧实现下通过后再迁移                |
| tests/library.test.ts                                                               | 新增HTTP组合错误、认证/归属优先及消息安全验证                                        |
| README.md、本轮设计/计划及本文                                                      | 说明范围、维护方式、验收与限制                                                       |

## 验证

- 初次quality:quick通过；最终结构校验顺序修正后，171项Vitest通过，新增12项兼容用例。结构失败不执行专用公式校验的用例先失败，再改用transform保证结构成功后才执行，该用例已通过。
- `npm run test:isolated`最终233/233通过，0失败，2个专用容器已核验清理；真实HTTP断言包括错误提示、401/403/404优先及不泄露Zod issues/原始字段。
- 定向 `scripts/test-isolated.ts queries 390 query-library.spec.ts`通过（36秒）：真实认证、SSR水合、查询、分页、收藏、分类CRUD/分配、编辑、创建成功但丢响应后的原回执重放、删除和退出换号，专用资源已核验清理。
- 最终`npm run quality:quick`全部通过：生成、格式、素材、类型、35项Node基础设施测试与171项Vitest（合计206项）、协议测试、生产构建和私有配置扫描。声明的前端/shared范围行覆盖率89.95%、分支81.22%，不代表全应用覆盖率。
- `git diff --check`通过。类型推导只复用对应请求payload；数据库查询选项等不同语义类型保留独立定义。

## 剩余范围与风险

未迁移AI输出、Python返回结果、其他请求接口或前端表单的所有校验。保留请求与数据库内部的防御性检查，但复用同一规则定义；未建立自动路由框架或双份规则。浏览器替身测试不能证明真实模型、邮件和生产负载；没有触碰生产数据、备份或模型，也未提交/push。
