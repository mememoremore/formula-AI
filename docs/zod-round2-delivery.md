# Zod第二轮交付记录

## 范围与实现

将关键任务输入和外部输出改为明确的Zod边界，保持原有业务接口；第一轮未提交改动一并保留。本轮不新增依赖、不改数据库结构、任务事务、额度和重试机制。

| 文件                                                                                | 修改原因                                                                                                                         |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| shared/schemas/task-input.ts                                                        | 识别、会话、提问、解释、导出和历史查询输入规则；保留UTF-16长度、ID大小写、nullable和各接口原有差异                               |
| server/services/task-input.ts                                                       | 薄领域解析入口，复用第一轮parseInput，只返回原有安全业务错误                                                                     |
| server/api/account/recognitions.post.ts、recognitions.get.ts                        | 使用解析结果提交识别和查询历史，保留队列、额度与归属校验                                                                         |
| server/api/account/conversations/index.post.ts、index.get.ts、[id]/messages.post.ts | 替换手写结构判断，保留缺省参数、鉴权、资源和配置检查顺序                                                                         |
| server/api/account/formulas/[id]/explanations.post.ts、exports/index.post.ts        | 解析后直接得到有类型的参数，去掉重复断言，业务调用保持原样                                                                       |
| shared/schemas/profile-input.ts、server/services/profile-input.ts                   | 昵称和头像结构校验；省略头像与null重置保持不同语义，类型由schema推导；原route的读取上限、租约、Sharp和存储流程保留               |
| shared/schemas/explanation.ts、shared/explanation.ts                                | 严格解释结构及推导类型，保留原导入入口；所有对象拒绝额外字段，先限制结构/数组数量，再执行专用数学校验；保留16000字符总上限和原文 |
| server/recognition/response.ts、python-adapter.ts                                   | 服务端专用Python结果schema，精确绑定requestId、忽略额外字段、不采信上游isMock；保留32KiB流读取、取消、HTTP错误分类和非重试语义   |
| tests/task-input.test.ts、output-contract.test.ts、support/unit-files.ts            | 输入兼容、UTF-16、资料省略/null、解释严格边界及结构失败不渲染的单元测试                                                          |
| tests/recognition.test.ts                                                           | 本地HTTP替身验证额外字段、错误根对象/字段的不同错误、请求绑定和安全提示；既有取消/超时用例保留                                   |
| tests/jobs.test.ts                                                                  | 真实HTTP验证输入错误、401/404优先级与无效提交不创建识别任务                                                                      |
| README.md、本轮设计/计划和本文                                                      | 维护边界、验证与后续范围                                                                                                         |

## 验证

- npm run quality:quick全部通过：生成、格式、素材、类型、35项Node基础设施测试与180项Vitest（合计215项）、24项协议测试、生产构建与私有配置扫描。声明的前端/shared范围覆盖率为行90.36%、分支81.72%，不代表全应用覆盖率。
- npm run test:isolated：234/234通过，0失败；新增HTTP任务边界用例通过，专用数据库/存储容器均核验清理。
- scripts/test-isolated.ts e2e 390 journey.spec.ts：通过，51秒；验证真实认证、上传识别、编辑、分类/收藏、提问、Word导出与退出换号。
- scripts/test-isolated.ts e2e shared explanation-presentation.spec.ts：通过，36秒；检查多屏宽下解释顺序、追问及历史呈现，并人工查看390px顶部/底部截图，公式与结构化内容正常渲染。
- scripts/test-isolated.ts e2e shared observability.spec.ts：通过，34秒；验证浏览器、HTTP、队列与Worker关联及错误诊断。
- scripts/test-isolated.ts faults：2/2通过，107秒；覆盖回执丢失、失败/停止历史、重试、Worker进程退出、中断片段保留、重复回执不重复扣额及断网/前台事件只读恢复。上述5项浏览器测试均通过，专用资源均核验清理。
- 最终check:source-format与git diff --check通过。

## 维护边界与风险

通用结构使用Zod；公式数学合法性仍交由原有专用校验，图片内容仍交由Sharp。数据库层的归属、并发和事务检查继续负责业务不变量，不能以schema代替。共享解释schema用于客户端，因此客户端增加Zod代码；生产构建已通过，但未对本轮包体做独立性能基准。请求未知字段继续剥离，解释输出继续严格拒绝，Python额外字段继续忽略，三者有意不同。

本轮没有统一所有旧接口/遥测协议或前端表单校验，没有创建自动路由框架或重复的类型定义。真实模型、生产负载和外部邮件不在替身验收范围。未操作生产数据、备份或模型，未提交或推送Git。
