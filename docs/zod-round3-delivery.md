# Zod第三轮交付与边界审计（2026-11-05）

## 实现与文件职责

在前两轮基础上收尾通用输入边界与重复规则。不增加依赖、不改数据库和任务协议、不做全接口自动包装；保留现有main工作区，不自动提交Git。

| 文件                                                     | 修改原因                                                                                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| shared/schemas/demo-input.ts                             | 元数据识别和演示聊天的明确schema；两阶段检查保留旧容器/字段错误优先级，限制数组后再遍历；保留原文、UTF-16长度和非UUID演示版本ID                    |
| server/api/chat.post.ts、server/api/recognitions.post.ts | 去掉手写结构判断和双重类型断言，使用safeParse结果；保留readBody及旧400/Invalid request错误形式，不套用账号workspace协议                            |
| server/utils/validate-body.ts                            | 删除无调用的isRecord/isText，仅保留演示接口专用HTTP错误入口                                                                                        |
| shared/types/api.ts                                      | ImageMetadata、RecognitionRequest、ChatMessage、FormulaContext从对应schema推导，旧导入路径保留；内部ChatRequest的解释/提示词上下文仍是独立业务协议 |
| shared/schemas/manual-formula-input.ts                   | 提供原样验证与服务端归一化两个明确入口，共享一套结构和数学检查，保证结构失败不执行KaTeX                                                            |
| app/utils/manual-creation.ts                             | 恢复回执复用原样schema，去掉重复ID/字段规则；先检查大小和账号，保持原请求键大小写、文本和原错误分类                                                |
| app/components/AccountProfileEditor.vue                  | 保存前复用profileInputSchema并发送解析结果，保留忙碌/草稿/取消门禁；失败保留草稿，头像省略/null语义不变；不引入额外表单库                          |
| tests/manual-formula.test.ts                             | 先在旧实现通过2项回归：原回执不归一化、不同账号优先、缺少/非法内容错误分类                                                                         |
| tests/demo-input.test.ts、tests/support/unit-files.ts    | 4项单测验证组合错误优先、原文、UTF-16、数值不强转、角色/历史限制与额外字段剥离                                                                     |
| tests/api.test.mjs                                       | 真实HTTP组合错误矩阵，验证原有status/message/statusMessage及无Zod issues泄露                                                                       |
| tests/e2e/profile-input.spec.ts                          | 专项验证资料已写入但回执丢失时保留原草稿、正常重试、不传头像保持原图、null重置以及4种视口无溢出；截图仅保存在专用私有测试目录                      |
| scripts/test-browser-matrix.ts                           | 将资料专项注册到完整浏览器矩阵，单独新建环境保留真实OTP限流                                                                                        |
| README.md、本轮设计、计划与本文                          | 记录维护规则、边界和实际验收结果                                                                                                                   |

## 最终边界审计

| 边界                            | 当前负责方式与保留原因                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 账号公式/分类/任务/资料JSON输入 | shared/schemas按领域定义；server/services薄parse入口返回安全400；鉴权/CSRF/归属/正文上限仍由原route负责                 |
| 公式库、识别和对话查询参数      | 各领域schema保留原长度、缺省值和cursor错误差异，数据库继续校验归属及分页锚点                                            |
| AI解释（模型、历史、SSE）       | 严格共享schema及推导类型；原有规范化和数学安全检查保留                                                                  |
| Python响应                      | server/recognition专用schema；协议字节上限/取消/状态错误仍由adapter负责                                                 |
| 旧演示请求                      | 本轮迁移的独立schema，不能直接替换成账号请求（ID、字段和错误协议不同）                                                  |
| 创建恢复回执                    | 原样验证schema＋外部大小/账号门禁；不改变重放body，归一化仅用于创建服务                                                 |
| 前端输入提示                    | 资料表单复用结构schema；公式即时渲染和创建提示继续复用manualFormulaFeedback等专用函数；不对每次键入重复构造整个任务请求 |
| 注册、登录与OTP                 | Better Auth负责自身协议、校验及限流，不复制其schema                                                                     |
| 文件/头像/导出文件内容          | multipart/受限读取、图片魔数/Sharp重编码、文件策略与租约；Zod不能替代内容安全和资源状态检查                             |
| 遥测输入                        | 现有手写解析器负责白名单、敏感信息丢弃、路由脱敏、时间窗及指纹；不能用普通对象校验代替脱敏                              |
| SSE快照、本地任务草稿、缓存     | 原有有界解析、任务状态机、版本排序和账号一致性；本轮不为了统一写法重做恢复协议                                          |
| 数据库/Worker                   | 事务、并发、防重复和计量约束继续独立存在，不以外部schema取代业务不变量                                                  |

## 实测验证

- 迁移前新增2项回执兼容用例，旧实现182项Vitest通过；迁移后186项Vitest通过，新增4项演示schema用例。
- npm run quality:quick全部通过：生成、格式、素材、类型、35项Node基础设施测试＋186项Vitest（合计221项）、24项协议测试、生产构建与私有配置扫描。声明的前端/shared范围覆盖率为行90.67%、分支82.01%，不代表全应用覆盖率。
- npm run test:isolated：235/235通过，0失败，212秒；新增HTTP错误优先与安全消息测试通过。
- scripts/test-isolated.ts queries 390 query-library.spec.ts：通过，38秒；含真实认证、SSR水合、创建回执丢失后的原请求重放、查询/分类/收藏/编辑与换号隔离。
- scripts/test-isolated.ts e2e shared profile-input.spec.ts：通过，32秒；真实PATCH写入后丢响应保留原草稿、重试、头像省略保持与null重置；320/390/430/1440px无溢出。人工查看320与1440截图，表单/按钮正常，诊断提示为用例主动注入丢响应所产生。
- scripts/test-isolated.ts faults：2/2通过，108秒；覆盖回执丢失、失败/停止历史、重试、Worker退出、中断片段保留、不重复扣额及断网/前台事件只读恢复。
- 本轮4项定向浏览器用例均通过，4套环境的数据库/存储容器均核验清理；没有操作开发资源。
- 最终typecheck:tests、check:source-format及git diff --check通过。

第二轮已完成解释呈现、390px完整旅程与观测验证，本轮未更改其对应运行时schema，不将前轮测试计作本轮重新执行。完整18次环境矩阵已注册资料专项，但本轮执行的是上述定向场景，并未重新跑全部18次。

## 风险、限制与后续维护

原样与归一化schema是为了兼容回执和新建两种语义，并非两套验证规则；字段变动应改共享定义并更新契约测试。没有引入自动路由层、表单框架或新依赖；仍存在上表明确保留的专用解析器，不声称所有typeof都已替换。

客户端会使用Zod进行解释、回执和资料校验，生产构建已通过；尚无本轮包体/低端手机CPU的独立基准。替身和本地HTTP测试不代表真实模型、SMTP或生产负载。没有操作生产数据库、备份、模型和线上服务；没有提交或推送Git。
