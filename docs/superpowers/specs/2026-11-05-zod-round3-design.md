# Zod第三轮设计：复用与边界收尾

延续用户已批准三轮迁移与本轮继续执行授权，在现有main工作区保留前两轮改动，不新建分支、不自动提交。

选择按领域明确schema、保留专用协议解析；不采用全接口自动包装，也不机械地将所有typeof检查替换为Zod。前者增加隐式行为，后者会破坏遥测脱敏、SSE快照合并及图片字节校验的职责。

1. 迁移最后两个演示POST接口。shared/schemas/demo-input.ts定义元数据识别、消息和上下文schema；保留旧UTF-16长度、原文、只收user/assistant、最后一条user、1～20条、非UUID演示版本ID、图片整数大小、逐层错误优先级。两个轻量schema阶段先限制容器，再解析字段；HTTP继续readBody与Invalid request状态文本，直接使用安全首条message，不改为账号workspace协议。删除已无调用的isRecord/isText。公共ImageMetadata/RecognitionRequest/ChatMessage/FormulaContext由相应schema推导；内部ChatRequest保留responseKind/baseExplanation等业务字段，不把演示输入当内部协议。
2. 创建输入分为原样验证schema和归一化schema；两者共用同一结构和专用数学检查，原样验证用于恢复回执，归一化用于服务端创建。回执仍先检查大小、根对象与账号；不同账号不解析内容；原请求键大小写和文本必须保留，不可在重放时改写。ManualFormulaCreator即时预览继续复用专用manualFormulaFeedback，不额外引入表单框架。
3. 资料表单提交复用profileInputSchema并发送解析后body，保留现有busy/dirty/选图状态门禁、头像省略/null、取消/序列、失败草稿保留。非法资料显示已有schema业务消息，正常布局不变。
4. 明确剩余专用校验：Better Auth负责注册/OTP；文件和头像字节由Sharp；遥测负责白名单和脱敏；SSE/本地任务草稿负责状态机及账号边界；数据库负责事务、归属与并发。它们不是遗漏的通用请求schema，不为了统一形式重写。

验收：旧回执兼容测试先通过；新增demo schema和HTTP错误优先/安全用例；quality:quick、隔离集成、定向query回执重放、资料手机端、解释呈现和faults回归。保留三轮交付文档，记录实际文件、测试和未验证范围；不触碰真实模型、备份及生产数据。
