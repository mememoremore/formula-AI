# Zod第二轮设计（2026-11-04）

按已批准三轮方案迁移：账号识别提交、会话创建/提问、解释提交、导出提交、识别/对话历史查询、资料输入、结构化解释及Python识别响应。保留第一轮未提交改动，不提交Git，不增库，不改schema/队列/模型/备份。

领域分文件：shared/schemas/task-input.ts、profile-input.ts、explanation.ts；server/services对应薄解析器复用parseInput安全400错误映射。请求保留未知字段丢弃、UTF-16长度、ID大小写与原nullable/缺省语义。识别名按原顺序trim与检查，问题不提前trim，历史cursor不擅自从旧404改为400。认证/资源/配置/正文读取限制顺序不变。资料只迁移结构，Sharp重编码、对象存储及租约仍在服务层。

AI解释使用严格Zod对象，所有层级拒绝额外字段，保留文本长度、HTML/控制字符、数组数量、schemaVersion=1与16000字符总上限。结构/数量通过后才执行KaTeX与总长度检查；parseExplanation保留通用Error提示，decodeExplanation仍先限制原始JSON长度、拒绝截断/围栏，再按既有规则规范化数学文本并二次验证。历史文本不重写，模型提示与计量/重试不变。FormulaExplanation类型从schema推导，客户端/SSE复用纯shared规则。

Python响应规则留在server/recognition：保留JSON Content-Type、32KB流读取、取消及HTTP错误映射。非对象JSON仍是无法解析错误，对象中字段错误仍是无效公式/模型版本错误。requestId须精确匹配本次请求（不强加UUID）；latex先trim、按旧规则拒绝空/超长/围栏/documentclass/NUL；modelVersion保持旧ASCII模式；额外字段继续忽略，结果isMock固定false，不采信上游confidence等字段。失败仍为非重试UPSTREAM InferenceFailure，不转换成HTTP400或原始ZodError。

测试：先补旧AI/Profile/Python契约用例，再迁移；增加任务输入、历史差异、资料省略/null、严格解释边界与上游错误分类/取消协议覆盖。最终quality:quick、隔离API全套、390px真实旅程、解释呈现/观测与故障恢复验收；真实模型及生产负载不在范围。
