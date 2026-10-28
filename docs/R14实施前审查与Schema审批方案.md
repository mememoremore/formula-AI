# R14 实施前审查与 Schema 审批方案

日期：2026-10-28。分支：`refactor/r14-chat-protocol`。

基线：`c13630d6fe9b3813e51dc54c328029fc8b3ead74`（R13）。开始时工作区干净。

**审批记录：本方案已于2026-10-28获用户批准。** 以下保留实施前审查记录；实际实施、兼容处理、验证结果与最终限制见《R14聊天历史与协议治理验收说明.md》。

## 1. 现状与证据

已核对根目录《Formula重构.md》、R8、R11、R13 的说明及源码。未找到独立 R0 报告文件，不能将旧结论视为当前验证结果。

| 范围     | 当前实现与证据                                                                                                                                               | 判断                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 轮次     | `prisma/schema.prisma:330`、`:385`：Conversation 没有修订号；ChatTurn 使用 QUEUED/PROCESSING/COMPLETED/FAILED，停止也持久化为 FAILED；Message 默认 COMPLETED | 事实；不新增业务任务状态                                               |
| 历史     | `server/worker/chat.ts:36`：按消息 COMPLETED 筛选，倒序取 19 条；失败/停止轮次的 USER 仍为 COMPLETED                                                         | 已用真实隔离数据库与受控 Worker 复现问题                               |
| 裁剪     | `server/chat/prompt.ts:12`：19 条、20,000 字符，删除开头 assistant；不校验完整问答配对                                                                       | 已确认规则缺口；字符预算不是 token 预算                                |
| 调用尝试 | `server/chat/deepseek-adapter.ts:20`：LangChain 和 SDK maxRetries 都为 0；ChatTurn.attemptCount 仅保存最新次数                                               | 可保留零内部重试；缺少逐次调用记录                                     |
| 额度     | `server/database/conversations.ts:164`：提交事务预留一次 CHAT 额度；R13 Worker 重试不重复预留                                                                | 隔离复现两次执行/调用只计一次额度，保留                                |
| 快照     | `server/database/conversations.ts:63`：会话、消息、最新 turn，随后另查固定公式上下文；没有一致读事务或修订号                                                 | 已确认协议缺口；并发混合快照为潜在风险                                 |
| SSE      | `server/api/account/conversations/[id]/events.get.ts:23`：最多 80 轮、750ms 间隔，每轮读完整快照，每 4 轮核对后再读；内容变化时发完整 snapshot               | 已测读取与帧体积，尚未测优化实现                                       |
| 客户端   | `app/utils/chat-state.ts:60`：位置/终态/attempt/文本前缀保护                                                                                                 | 有效保护保留；合法重试清空可能被拒绝、过期模型信息可能被接受，均已复现 |
| 连接     | `app/composables/useConversationEvents.ts:52`：15 秒 watchdog；服务器无变化时不发 snapshot                                                                   | 长时间首字等待可能触发重连，属于代码推导风险，尚未做真实网络故障验收   |
| 公式绑定 | `server/database/conversations.ts:10`：LaTeX/版本 ID 固定，展示标题读取当前 Formula.title                                                                    | 版本语义保留；标题修改也须纳入修订范围                                 |

当前数据流：首次实际发送 → 幂等创建/提交 → USER 消息与业务额度及队列同事务 → Worker attempt → 模型流 → 片段写库 → assistant/业务终态/队列确认同事务。GET、SSE、停止响应均返回 SavedConversation，R11 归属保护和 R13 执行权围栏已经存在，不重新实现。

## 2. 拟采用的历史语义

1. 页面继续保留所有历史消息、失败片段和停止记录，不删除历史数据。
2. 模型只接收历史 COMPLETED 轮次中，同账号、同会话、同 turn 的完整 USER + COMPLETED ASSISTANT 配对；缺失、不一致、FAILED、停止、未完成的整轮均排除。
3. 当前问题单独追加且仅一次；最多最近 9 个完整历史问答 + 当前问题，20,000 字符预算按整对裁剪。当前问题不得被裁掉。继续保留现有问题长度校验。
4. 旧数据 `turnId=null` 无法可靠证明轮次归属，默认保留展示、排除模型上下文，不凭角色邻接补造成功轮次。
5. 固定公式版本 ID 和 LaTeX 不变；页面增加简短说明，明确失败/停止记录不参与后续上下文，避免展示与模型请求语义不一致。

示例：成功 Q1/A1 → 失败 Q2/片段 → 新问题 Q3，模型收到 Q1/A1/Q3；停止 Q2 同理。Q3 若依赖被排除内容，用户需重新提供必要信息。Worker 重试仍属于同一个业务轮次，不把上一 attempt 的片段加入上下文。

## 3. 待批准的具体 Schema

### 3.1 会话权威修订号

在现有 Conversation 增加：

```prisma
revision BigInt @default(0)
```

迁移增加 `CHECK (revision >= 0)`。默认 0 仅表示部署起点，不伪造历史更新序列；无需额外索引，按现有 id/ownerId 查找。

### 3.2 逐次模型调用记录

```prisma
enum ChatCallStatus {
  PREPARED
  IN_FLIGHT
  SUCCEEDED
  FAILED
  CANCELLED
  UNKNOWN
}

enum ChatUsageSource {
  UNKNOWN
  PROVIDER_REPORTED
  MOCK
}

model ChatCallAttempt {
  id                  String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ownerId             String          @db.Uuid
  turnId              String          @db.Uuid
  workerAttempt       Int
  callIndex           Int             @default(1)
  queueJobId          String          @db.Uuid
  provider            String          @db.VarChar(32)
  model               String          @db.VarChar(100)
  isMock              Boolean
  status              ChatCallStatus  @default(PREPARED)
  preparedAt          DateTime        @default(now()) @db.Timestamptz(3)
  dispatchIntentAt    DateTime?       @db.Timestamptz(3)
  transportInvokedAt  DateTime?       @db.Timestamptz(3)
  responseObservedAt  DateTime?       @db.Timestamptz(3)
  closedAt            DateTime?       @db.Timestamptz(3)
  durationMs          Int?
  providerRequestId   String?         @db.VarChar(200)
  httpStatus          Int?
  finishReason        String?         @db.VarChar(32)
  errorCode           String?         @db.VarChar(64)
  usageSource         ChatUsageSource @default(UNKNOWN)
  inputTokens         Int?
  outputTokens        Int?
  totalTokens         Int?
  resultCommittedAt   DateTime?       @db.Timestamptz(3)
  resultDiscardedAt   DateTime?       @db.Timestamptz(3)
  createdAt           DateTime        @default(now()) @db.Timestamptz(3)
  updatedAt           DateTime        @updatedAt @db.Timestamptz(3)
  turn                ChatTurn        @relation(fields: [turnId, ownerId], references: [id, ownerId], onDelete: Cascade, onUpdate: Restrict)

  @@unique([turnId, workerAttempt, callIndex])
  @@index([ownerId, createdAt(sort: Desc), id])
  @@index([status, updatedAt, id])
  @@map("chat_call_attempts")
}
```

ChatTurn 增加反向关系 `callAttempts ChatCallAttempt[]`。复用现有 `[id,ownerId]` 唯一键，不另建重复索引；queueJobId 仅作为审计标识，不与可被队列归档的记录建立级联外键。

SQL CHECK：workerAttempt/callIndex > 0；durationMs/token 字段为 null 或非负；httpStatus 为 null 或 100..599；resultCommittedAt/resultDiscardedAt 不能同时非空；UNKNOWN/MOCK 用量来源对应 token 字段必须全部 null；PROVIDER_REPORTED 至少一个可信 token 字段非空。模型用量缺失不填 0，不据此推算费用。

业务请求 = ChatTurn/requestKey；Worker attempt = pg-boss retryCount + 1；模型调用 attempt = 上述唯一键。当前每次 Worker 执行只有 callIndex=1，不新增自动内部重试。历史任务不回填虚假调用数据。

调用审计随用户/轮次删除级联，遵循现有账号数据删除边界；不是永久财务账本。不存 Prompt、消息正文、密钥、完整供应商错误或原始响应体。

## 4. 事务与并发边界（待批准）

### 会话修订

以下可见状态变化在原事务内 revision + 1：提交新轮次；聊天 beginAttempt；清空片段/初始化模型信息；片段更新；完成；失败/重试；停止；R13 后台修复。无变化的幂等重放不增加。独立调用审计变化不改变会话 revision。

统一加锁方向：**conversation → queue claim → turn/messages**。特别调整当前聊天初始化、片段保存入口，在触碰队列行前锁会话；不修改识别和导出任务的状态语义。继续复用 R13 claim/token/attempt 检查，修订号不代替执行权。

GET/SSE/停止后的快照通过 PostgreSQL RepeatableRead 事务读取会话、消息、turn、公式上下文；必须保证返回的 revision 与全部 DTO 字段属于同一数据库快照，不能在多次普通读取之间拼装。

当前上下文标题来自可变 Formula.title。拟在 SQL 迁移增加 **Formula 标题变化的 AFTER UPDATE 触发器**，按 conversation.id 固定顺序锁定该公式版本关联会话并递增 revision；标题未变不触发。不覆盖固定公式版本、不修改 R6.1 冲突检查。标题修改会涉及关联会话行，存在高扇出成本，需隔离并发测试及锁顺序审查。与现有 Serializable 冲突重试保持兼容。不通过冻结标题偷偷改变产品语义。

### 调用审计与网络

1. 发起上游请求前，在有效 claim 保护下持久化 PREPARED/调用意图；写库失败则不发起付费调用。
2. 通过当前 SDK 可配置 fetch 包装器记录调用边界，仅新增必要的类型化观测接口，不替换 LangChain。先持久化意图，再调用 transport；观测到 transport 调用/HTTP 响应时补写对应时间、状态及安全请求 ID。
3. **调用意图不证明请求已经送达**；网络与数据库不存在共同事务。进程在任一边界崩溃时保留 UNKNOWN，不宣称未调用或未计费。transport promise 立即注册错误处理，避免观测写库失败造成未处理拒绝。
4. 流正常结束记录本地 SUCCEEDED；最终答案、业务完成、队列确认及 resultCommittedAt 在同一事务提交。供应商成功不等于业务结果已经提交。
5. 失败/取消/失去执行权仅更新本次调用审计，不允许旧 Worker 改写新答案。失败补写须检查 resultCommittedAt，避免事务已提交但响应丢失后将成功误标为丢弃。
6. R13 后台增加独立的小范围调用审计核对：检查真实队列和 claim，失活但结果不明的记录标 UNKNOWN，不能据此修改业务终态、退款或删除资源。不能只扫描活动 ChatTurn，否则终态任务的遗留调用记录会漏掉。数据库不可用时停止；不凭年龄宣称供应商失败。迟到的可信元数据只能补充原调用记录。
7. 用量读取供应商实际返回的原始 usage，缺失为未知；当前安装的 LangChain 会在响应元数据保留 usage，实施时以受控 chunk/HTTP 测试验证，不采用推断 token 值。

## 5. 协议与兼容部署（待批准）

- SavedConversation 增量增加 `protocolVersion: 2`、`revision: 十进制字符串`，不把 BigInt 直接 JSON 化。GET、首次发送响应、SSE snapshot、停止响应统一。
- 新客户端通过 GET/POST 请求头 `X-Conversation-Protocol: 2`，EventSource 使用 `?protocol=2` 声明能力；旧客户端仍接收 snapshot 完整事件与原字段。
- 新客户端保留账号/会话/请求代际检查，再按服务端 revision 比较：小于拒绝，相同且内容相同不更新，相同但内容冲突视为协议错误并完整重读，大于允许合法重试清空等变化。继续校验不可变消息与公式版本，绝不使用客户端时钟。
- 新协议缺失合法 revision 不静默降级：保留已确认数据，提示重连/刷新，停止接受不可排序更新。旧客户端仍可展示，但不能承诺获得新排序保证。
- 断线重连一律先返回最新完整快照；不依赖历史事件重放，不启动模型调用。
- 增加轻量 revision 探测，仅在变化时完整读取/序列化；保留完整快照，不先引入增量补丁。v2 提供不超过 5 秒的心跳并让 watchdog 识别；旧客户端可按不超过 10 秒间隔补发完整快照以兼容既有 watchdog，成本单独测量。
- 暂不新增历史加载端点，仍保留最近 100 条及 hasEarlierMessages 的真实限制。模型上下文预算与 UI 历史显示是两种独立能力。
- **发布顺序**：加法迁移 → 停止并排空旧 API/Worker 写入者 → 部署全部支持 revision 的 API/Worker → 验证每类写入口 → 开放 v2 客户端。不能让不会递增 revision 的旧 Worker 与 v2 客户端并存并宣称顺序可靠。
- 本轮仅在 R1 独立环境执行迁移。生产部署、迁移及推送不由本次审批自动执行。

回滚：先关闭 v2/停止新写入者，再回退应用到旧协议；优先保留新增列、审计表和触发器，不自动执行 DROP 或删除调用记录。新旧应用切换期间禁止混合写入。迁移 SQL 在隔离库验证原子执行/失败重试，失败时不启动新 Worker。

## 6. 已执行的旧实现基线

脚本：`scripts/measure-chat-baseline.ts`，首先导入 R1 integration 守卫，API/数据库/容器身份一致后才连接。独立 runId：`5a0cdf40-a4f8-4cc5-a9cf-1f9607ecf672`。只执行原有迁移；测试用户和其队列任务在 finally 清理，不操作开发用户。

真实 PostgreSQL/pg-boss + 受控模型结果：失败问题进入上下文 **是**；停止问题进入上下文 **是**；同 attempt 合法片段清空被拒绝 **是**；过期模型元信息被接受 **是**；Worker 尝试 **2**、实际替身调用 **2**、CHAT 业务额度 **1**。元信息乱序为纯客户端快照构造，片段重置来自真实 Worker 事务边界。

每组 20 次片段更新，每次分别模拟 1 或 4 个连接读取；实际 Prisma query 事件计 SQL，UTF-8 编码 snapshot 帧计字节。

| 历史消息数 | 连接 | 可见消息 | 读取 SQL 总数 | 每轮读取 P50/P95 ms | 未压缩快照帧字节总数 |
| ---------- | ---- | -------- | ------------- | ------------------- | -------------------- |
| 0          | 1    | 1        | 100           | 8.10 / 12.29        | 26,440               |
| 0          | 4    | 1        | 400           | 9.29 / 12.27        | 105,760              |
| 20         | 1    | 21       | 100           | 6.82 / 8.00         | 486,880              |
| 20         | 4    | 21       | 400           | 10.24 / 12.85       | 1,947,520            |
| 100        | 1    | 100      | 100           | 8.59 / 11.41        | 2,306,340            |
| 100        | 4    | 100      | 400           | 15.89 / 19.67       | 9,225,360            |
| 200        | 1    | 100      | 100           | 9.09 / 11.35        | 2,308,460            |
| 200        | 4    | 100      | 400           | 19.85 / 25.93       | 9,233,840            |

限制：这是 readConversation 的真实读取与序列化基线，不是完整 HTTP SSE 压测；不按 750ms 实时等待，不含认证、后台核对、代理压缩和网络开销。每次都改变片段，不能用该组结果证明 revision 探测会减少活跃更新的字节。优化后须增加无变化等待场景，使用相同数据重测，再报告收益或代价；目前没有“优化后”数据。

已执行命令：`npm run test:env:create`、`npm run test:server`；`npm run typecheck:tests`（通过）；在该 manifest 下执行 `node scripts/run-node.mjs node_modules/tsx/dist/cli.mjs scripts/measure-chat-baseline.ts`（退出码 0）。证据保存在本地忽略目录 `tmp/r14-baseline-*`，不提交凭据或测试资源清单。

## 7. 预计修改范围与验证关卡

| 批次     | 主要文件                                                                                                                  | 验证                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 历史     | `server/worker/chat.ts`、`server/chat/prompt.ts`、相关类型/测试                                                           | 完整配对、失败/停止/旧数据、预算和固定版本                        |
| 持久化   | `prisma/schema.prisma`、新迁移、聊天调用审计数据库模块                                                                    | 约束、历史兼容、迁移失败、权限与级联                              |
| 尝试追踪 | `server/chat/adapter.ts`、`deepseek-adapter.ts`、`mock-adapter.ts`、聊天 Worker/后台核对                                  | 请求前后崩溃、未知计量、两次调用一次业务额度、旧 claim 围栏       |
| 权威快照 | `server/database/conversations.ts`、`chat-progress.ts`、`task-lifecycle.ts`、`server/worker/lifecycle.ts`、公式标题触发器 | 全写入口递增、一致读、多 Worker、R6.1/R13 回归                    |
| 协议     | 会话 GET/消息/SSE/停止接口、`shared/types/tasks.ts`、`app/utils/chat-state.ts`、`useAccountChat`、`useConversationEvents` | GET/SSE/停止乱序、相同 revision 冲突、旧客户端、重连和账号切换    |
| 测量     | 基线脚本、隔离协议测试及必要的定向浏览器测试                                                                              | 相同 fixtures 前后比较，等待/持续更新/断线/终态；保留完整快照优先 |

不动 R12 资源计量、对象清理、额度语义、识别适配器、任务框架及 UI 设计系统。不推送未经滤除验收素材的原始 Git 历史。

待批准决策：上述 Schema/SQL 约束及标题触发器；会话写入事务与一致读边界；v2 增量协议及停止旧写入者的部署顺序；仅完整成功轮次参与模型上下文、无法配对旧记录只展示。批准后才进入这些部分的实施。
