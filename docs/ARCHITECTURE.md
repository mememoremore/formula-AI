# 当前架构

## 服务边界

应用采用 Nuxt 全栈入口，后台任务和 Python 推理独立运行。服务共用业务数据库，队列位于 PostgreSQL 的 pgboss schema，不依赖 Redis。

    浏览器 → Nuxt 页面 / 同源账号 API → PostgreSQL
                   ↓ 提交任务与队列（同一事务）
                Node Worker → Python CPU 识别 / DeepSeek / Pandoc
                   ↓
              私有 S3 兼容存储

[前端目录](../app)、[服务端目录](../server)、[共享规则](../shared)、[数据库模型](../prisma/schema.prisma)分别负责展示与交互、认证和业务执行、领域输入/输出约束、持久化。Python 服务在 [services/recognition](../services/recognition)，不直接接受浏览器的公开请求。

API 校验身份和输入并持久化意图；Worker 处理长耗时工作。数据库事务内不等待模型、对象存储或文档转换。外部调用失败和结果不确定需要独立状态与恢复流程，不能依靠一次数据库回滚解决。

## 数据与归属

| 领域      | 主要模型与用途                                                                                |
| --------- | --------------------------------------------------------------------------------------------- |
| 身份      | User、AuthSession、AuthAccount、AuthVerification、AuthRateLimit：Better Auth 账号、会话和验证 |
| 文件      | StoredFile、ResourceLease、StorageCleanupAudit：对象元数据、写入租约与清理审计                |
| 识别      | RecognitionTask：输入图、识别模式、请求键、状态与结果                                         |
| 公式库    | Category、Formula、FormulaVersion、Favorite：分类、公式、不可变内容和收藏                     |
| 对话      | Conversation、ChatMessage、ChatTurn、ChatCallAttempt：会话、消息、轮次与供应商调用审计        |
| 配额/导出 | DailyUsage、ExportTask：UTC 日额度和 Word 任务                                                |

业务查询带当前会话 owner；部分关系通过复合唯一键和复合外键约束同账号关联。数据库约束是补充，不能代替接口鉴权。本项目不宣称启用了 PostgreSQL 行级安全策略。

Formula 为用户可管理的条目，FormulaVersion 是内部不可变内容。编辑创建新的内容记录；已有会话和导出仍绑定当时的公式，避免历史答案含义改变。页面不展示 v1/v2 或提供版本管理入口。编辑带预期内容编号与原始标题，冲突返回 409；软删除隐藏条目并保留已绑定的数据。详见[相关决策](decisions/004-conversation-consistency.md)。

## 识别链路

1. 浏览器裁剪图片并准备上传键，以会话身份上传原始图片字节。
2. API 校验类型、大小、真实图像内容，经 Sharp 处理后写入私有存储；数据库记录资源和租约。
3. 浏览器携带 fileId、mode、requestKey 提交识别意图。
4. API 在事务内验证文件归属与状态、检查请求幂等、扣项目额度并入队。
5. Worker 验证执行权，读取私有图片后调用 Python；适配器检查响应与 requestId 的绑定。
6. 在仍持有执行权时提交结果并完成队列任务；页面读取任务/公式结果。

图片上传和识别提交不是跨存储原子事务。提交失败时保留可确认的上传回执；没有引用的图片按租约和宽限期规则核对，不直接按目录年龄删除。见[存储手册](私有对象存储操作手册.md)。

## 对话与导出链路

会话绑定公式内容或作为自由对话创建。提问的 requestKey 标识一次提交；数据库保存轮次后入队。Worker 调用 AI，将进度持久化并递增快照版本。SSE 推送数据库会话快照，前端校验会话/轮次与版本；断开后有限重连和轮询补读。停止与结果提交也受状态、版本和执行权约束。

结构化解释先验证 Zod 结构、数量和长度，再进行数学渲染检查。仅完整成功问答参与后续上下文，按完整轮次裁剪；失败和停止片段保留展示，但不作为完整回答进入模型上下文。失败后的重新生成是新调用，不是从中断 token 续写。

导出任务绑定内部公式内容，Worker 用 Pandoc 转成包含原生数学对象的 DOCX，写入私有存储。下载仍检查账号和任务成功状态。不同 Office 客户端的显示效果须实测，不能仅凭文件生成成功认定全部兼容。

## 幂等与执行权

同账号同 requestKey 同请求重放返回已有结果；内容不同拒绝冲突。任务、额度和 pg-boss 入队共享事务。Worker 处理前及提交时验证队列 claim、有效期、尝试次数与 owner/task；旧 Worker 不得覆盖新的执行者。业务结果与队列完成也在同一事务中落账。

这些保证针对项目内业务状态和额度，不承诺外部供应商绝对只调用一次或只计费一次。调用成功后响应丢失会产生不确定性，由 ChatCallAttempt 等记录辅助排查。见[任务手册](后台任务与导出操作手册.md)和[失败恢复](FAILURE_RECOVERY.md)。

## 安全与观测

认证、Origin/CSRF、归属检查先于业务操作；前端 owner 参数只用于发现账号错配，不是授权凭证。存储无公开读权限，文件通过账号 API 访问。Zod 不能替代认证、事务、图像解码或业务状态机。

可选遥测把浏览器、API、Worker、Python 的 trace 上下文串联。日志只收集经过过滤的诊断字段，不记录原始密码、Cookie、请求正文或图片。关闭监控不影响业务完成。详见[观测指南](OBSERVABILITY.md)。

## 部署边界

本地通过 Compose 启动 PostgreSQL、存储和可选 Python；Nuxt 与 Worker 在不同进程运行。生产使用 [compose.production.yaml](../compose.production.yaml)，Web 仅映射宿主回环地址，由现有 Nginx 提供 HTTPS。模型只读挂载，权重、凭据、数据库和文件数据独立于镜像。监控栈可单独启停，不默认把整套服务压入小内存服务器。
