# Zod第一轮设计（2026-11-04）

用户已批准三轮方案并要求开始第一轮：引入共享schema，迁移公式创建/编辑、收藏、分类写入与公式库查询输入，保留现有API契约。沿用main，不改数据库、任务、模型、备份，不提交或推送。

使用已在依赖树中的Zod4.6.7，声明为精确直接依赖。选择明确领域schema与一个薄服务端parse适配器；不做自动路由框架，不向客户端返回Zod issues或原始输入。适配器safeParse失败转换WorkspaceError(400)，仅输出已定义业务提示。

shared/schemas/manual-formula-input.ts定义创建，formula-input.ts定义编辑/收藏；library-input.ts定义分类名/分配/列表查询。资源ID的旧十六进制8-4-4-4-12格式提取到纯shared/resource-id.ts，同时供数据库安全guard和Zod使用，不改为更严格的z.uuid。长度保持原JavaScript UTF-16 .length，用refine显式保留；禁止coerce，未知字段沿用丢弃行为。

创建：先完整字段类型及requestKey检查，再沿用manualFormulaFeedback的名称/LaTeX/安全命令/KaTeX校验，最后trim title/latex并小写requestKey。编辑：对象中的expectedTitle错误优先，原始title/latex长度限制，不提前trim预期标题或版本ID；语法/事务冲突继续由既有业务处理。分类：先trim再NFC后检查长度与控制字符。查询：q按原始长度校验再trim；category/cursor保持大小写，favorites仅接受true/false字符串，输出布尔值；不放宽数组、数字或null。

认证、CSRF、预期账号和资源归属检查仍先于输入解析；类别分配与编辑保持先读本人公式再解析body的404优先行为。保留请求体大小/Content-Type/JSON读取限制。数据库内部验证继续做防御检查，规则复用同一个schema/已有专用函数，不删除事务与归属约束。

通过schema推导输入类型，保持原ManualFormulaInput类型导入路径兼容，领域mutation引用共享payload类型，客户端只导入类型；不把KaTeX或后端服务打入额外客户端运行依赖。测试先固定旧消息、归一化顺序和多错误优先级，再以Vitest与隔离HTTP/API/Query浏览器证明兼容；最终quality:quick构建及私有配置扫描。

创建schema单独引用KaTeX专用校验，避免将其与普通收藏/编辑的结构规则耦合。

维护参考：[Zod schema API](https://zod.dev/api)、[错误定制](https://zod.dev/error-customization)。schema不使用全局error map，HTTP适配保留既有提示。
