# 失败恢复收尾实施计划

用户已批准完成：断网/前后台恢复、失败回答重新生成、遗留图片核对清理闭环。按brainstorming梳理现有机制后，复用当前接口、队列、文件审计和事务，不迁移数据库、不引入依赖。

## 设计与约束

1. useTaskPolling在online/visibilitychange/pageshow时，只读重读并去重；离线/隐藏时暂停定时轮询。暂时失败指数退避至30秒，权限/404不自动重试，保留旧快照。聊天恢复读取成功后由现有SSE订阅逻辑连接，不重新生成任务。监听器离开页面时注销。
2. 失败回答旁提供重新生成按钮，取最后失败轮次的原问题，复用send及会话存储幂等回执；旧问题与失败片段不改。新生成明确消耗一次额度，重复点击/回执丢失不重复提交。结构化解释首轮继续沿用现有专用重新生成入口。
3. 遗留清理仅针对当前桶数据库登记的IMAGE，READY/DELETING、超过至少24小时宽限期、无引用、无活动/不确定租约。复用resourceTransaction、DELETING围栏、HEAD确认和storageCleanupAudit；删除/HEAD/数据库不确定时保留计量供重试。PENDING、未知对象、头像、DOCX、备份、模型永不自动清理。新增独立后台有界扫描，默认report模式，可通过显式apply配置启用安全范围删除；本机先只读核对再决定启用，不能用测试桶标记绕过环境隔离。

## 文件与步骤

- [x] 前端恢复：app/composables/useTaskPolling.ts、app/composables/useAccountChat.ts，必要的纯调度工具及单元测试；浏览器断网/上线/切回前台验证不增加任务。
- [x] 重新生成：app/utils/chat-state.ts、app/components/AccountChat.vue、app/composables/useAccountChat.ts、tests/chat-state.test.ts、tests/e2e/faults.spec.ts；验证旧片段保留、新尝试单次扣额、提交回执丢失沿用原键。
- [x] 安全图片清理：server/resources/cleanup.ts及独立sweep模块、scripts/worker.ts、隔离resources集成；保护引用/宽限期/不确定状态，验证重复清理、异常恢复及并发提交。
- [x] 类型、单元、隔离集成、定向浏览器和故障演练串行完成，最后再构建，避免Prisma生成与子进程测试相互影响。仅操作隔离测试资源。
- [x] 更新文档与每文件原因、验证结果/边界；不自动推送GitHub。保留此前自动错误中心的未提交改动。

## 文件与原因

| 文件                                        | 原因                                                         |
| ------------------------------------------- | ------------------------------------------------------------ |
| app/composables/useTaskPolling.ts           | 网络/前台只读恢复、失败退避与监听清理。                      |
| app/composables/useAccountChat.ts           | 恢复SSE，重新生成复用已有幂等回执。                          |
| app/utils/chat-state.ts                     | 安全提取最新失败文本轮次的原问题。                           |
| app/components/AccountChat.vue              | 增加明确计额的重新生成入口并保留旧回答。                     |
| server/resources/cleanup.ts                 | 当前桶已完成图片的受限清理，24h下限、引用保护和审计恢复。    |
| server/resources/orphan-cleanup.ts          | report/apply/off、有界游标批次、单对象异常隔离和关闭屏障。   |
| server/diagnostics/operations.ts            | 新核对操作和安全数量白名单。                                 |
| scripts/worker.ts                           | 启停独立核对并等待当前批次结束。                             |
| scripts/orphan-images.ts                    | 本机只读核对；单文件apply必须明确文件和当前桶。              |
| .env.example                                | 记录默认report，未改变本机自动删除配置。                     |
| tests/chat-state.test.ts                    | 原问题选择和不可变片段边界。                                 |
| tests/resource-policy.test.ts               | 默认模式及非法配置校验。                                     |
| tests/resources.test.ts                     | 引用/宽限/PENDING/DOCX保护，删除不确定恢复、游标与调度停止。 |
| tests/e2e/worker.ts                         | 首次失败与慢响应受控模型替身。                               |
| tests/e2e/faults.spec.ts                    | 重新生成、回执丢失、离线/前台恢复、片段和额度断言。          |
| package.json                                | 增加storage:audit，只读为默认，无新增依赖。                  |
| README.md、docs/FAILURE_RECOVERY.md、本计划 | 操作说明、语义、验收和边界。                                 |

## 验收

完整quality门禁通过：格式、资源、类型、149单元、协议、生产构建及客户端私有配置扫描。完整隔离集成232/232通过；单对象异常游标改进的resources隔离回归通过。两项390px真实浏览器faults演练通过，监督Worker实际重启一次。每次清理2个隔离容器，未操作开发数据库或模型。具体结果保存在本机tmp/recovery-*.log和tmp/r16-artifacts。

实际存储只读核对：9个文件均REFERENCED_KEEP。自动审批明确拒绝把本机.env模式切换apply，理由是用户尚未明确批准持久自动删除开关；已保留默认report，未绕过拒绝。删除实现已在隔离环境验证，启用实际自动删除需要用户明确确认。

## 风险与未验证

前台恢复通过visibility事件模拟，未声称真机系统杀进程测试通过。保存片段可恢复，最后未落库片段不保证；重新生成是新请求并占一次额度，不是token续写。未知写入保留人工核对，不盲删或释放容量。内部额度单次不等于供应商计费exactly-once。未新增业务表或依赖；新代码尚未提交推送GitHub，保留前轮自动错误中心改动。

最终运行核对：最新Nuxt登录页200，Worker指标9464为200；Worker启动显示report，首轮核对6张符合年龄条件的图片全部保留，candidates=0、deleted=0。全量只读报告仍为9个REFERENCED_KEEP。待提交源码敏感值/运行资源检查0命中；临时测试入口已移除。自动删除开关已单独请求用户明确授权，未得到回答前继续report。

## 2026-11-03 本机启用确认

用户已明确回复“授权改为 apply，启用受限自动清理”，随后确认继续。自动审批在取得明确授权后允许切换。本机.env已设FORMULA_RESOURCE_ORPHAN_MODE=apply；先确认没有活跃任务，再重载项目。Worker启动日志确认apply，首次已完成核对：{"reviewed":6,"candidates":0,"deleted":0,"kept":6}。项目登录页200。此前关于report/待授权的段落是当时状态，由本节更新；默认配置模板仍保留report，不将私有.env提交。
