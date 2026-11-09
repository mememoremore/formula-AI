# 停止任务、推荐C路径与入口调整验收（2026-11-09）

## 最终行为

1. 任务中心的排队、处理和暂停任务，在时间行右侧显示“停止任务”；确认后停止未完成项，已生成的公式、回答及导出结果保留，已使用额度不退还。支持批次、单次识别、AI回答、Word导出。数据库与队列状态共同提交，停止后的迟到识别不能重新写入公式；已完成的结果不改为停止。
2. 首页新增“为你推荐”：规则筛选最多20条候选，再由AI结合年级、学习目的、公式内容、适用条件、笔记、熟练度和复习时间选3～5条并排序说明理由；不足3条时不凑数，只允许库内ID，同式去重，已掌握降权。规则预览不会调用AI；点击生成使用1次AI额度，相同画像和公式快照复用缓存，并发点击只扣一次；资料、公式、分类或熟练度变化后使用新指纹。AI不可用、超时或输出非法时明确展示规则结果。没有新增向量数据库。
3. 图片入口改成输入提问前的圆形加号，移除旧“公式图片”文字图标，选择/粘贴、识别、校对及图片草稿保护继续保留。
4. 批次中“识别失败”左侧增加“重新上传公式图片”：仅替换当前失败区域，确认上传后重新排队；已成功的公式、原整图及其他区域保留。JPEG/PNG、10MB限制及服务端图片校验沿用原规则；重传重新识别使用1次识别额度，上传或提交响应未知时沿用同一编号，不重复提交。
5. 批次、识别与对话记录的删除提示统一：不进入回收站，不删除对应公式，记录删除后不能从回收站恢复。公式本身删除才进入保留10天的公式回收站；后端删除记录行为继续只影响记录，未将任何历史搬入公式回收站。
6. 内部聊天页删除新建聊天、学习记录，外层AI助手入口保留，返回标题与公式参考维持正常间距。

## 文件清单与修改原因

- `app/pages/tasks.vue`：时间行末尾增加停止按钮、确认操作和已停止状态，保留最新20条显示规则。
- `server/api/account/tasks/[id]/stop.post.ts`：新增四类任务的停止接口，验证账号与任务类型。
- `server/database/task-cancellation.ts`：事务内取消队列和业务状态；已完成结果保留，停止批次并阻止后续派发。
- `server/database/task-submissions.ts`：抽出已有识别准入与扣额事务，供批次原子投递复用，保留原幂等规则。
- `server/worker/recognition-batches.ts`：批次、区域和子任务同事务确认，旧协调者失去租约或请求变化后不得再派发。
- `shared/types/recognition-batch.ts`：扩展已停止状态与停止数量，避免把主动停止统计为识别失败。
- `app/components/TaskProgress.vue`：主动停止单独显示，不显示为处理错误，并保留正常完成文案。
- `prisma/schema.prisma`：新增账号级推荐缓存模型，原模型字段和原记录保持兼容。
- `prisma/migrations/202611090005_recommendation_cache/migration.sql`：只新增推荐缓存表、索引和账号外键。
- `prisma/migrations/202611090006_batch_cancelled_status/migration.sql`：事务内扩展批次状态CHECK以允许CANCELLED，不改动原行数据。
- `shared/recommendations.ts`：规则排序、同式去重、候选上限和AI库内ID/数量验证。
- `server/database/recommendations.ts`：C路径候选筛选、画像输入、AI排序、缓存指纹、单次扣额并发保护与规则降级。
- `server/api/account/recommendations/index.get.ts`：只读推荐及缓存，不自动调用AI。
- `server/api/account/recommendations/index.post.ts`：用户点击后生成或复用推荐，校验当前画像指纹和额度。
- `app/components/PersonalizedRecommendations.vue`：首页推荐列表、学习顺序与理由、生成按钮、缓存复用和明确的规则预览。
- `app/pages/index.vue`：登录账号首页加入为你推荐区域。
- `app/utils/account-cache.ts`：公式相关变更同时使推荐视图失效。
- `app/components/ChatComposer.vue`：将图片入口改为输入提问前的圆形加号。
- `app/components/ChatFormulaImage.vue`：支持隐藏原文字图标入口并暴露原文件选择器供加号使用。
- `app/components/AccountRecognitionBatch.vue`：识别失败左侧增加单条图片重传弹窗，保留成功结果及未确认请求的编号。
- `server/api/account/recognition-batches/[id]/parts/[partId]/replace.post.ts`：新增失败区域替图接口，校验图片及旧任务预期版本。
- `server/database/recognition-batches.ts`：失败区域替换的账号隔离、并发校验及幂等保护；停止与失败分开投影。
- `server/database/batch-history-mutations.ts`：已停止批次也可删除记录，继续仅隐藏历史、不删除公式。
- `app/components/AccountBatchPreparation.vue`：批次删除提示改为不进入回收站且无法恢复，允许管理已停止记录。
- `app/components/AccountHistory.vue`：识别记录删除提示明确不进入回收站且不删除对应公式。
- `app/components/AccountConversations.vue`：对话记录删除提示明确不进入回收站且不删除对应公式。
- `app/components/AccountChat.vue`：移除内部新建聊天和学习记录，保留外层AI助手入口。
- `tests/recognition-batch-worker.test.ts`：覆盖事务派发、请求复用及批次停止/请求变更后的旧派发者保护。
- `tests/recommendations.test.ts`：新增规则优先级、同式去重、20条候选、AI数量及库内ID验证。
- `tests/components/task-progress.test.ts`：停止状态与真正失败区分显示的组件回归。
- `tests/components/chat-composer.test.ts`：圆形加号位于提问之前且不显示旧文字入口。
- `tests/support/unit-files.ts`：将新增推荐规则测试纳入正式单元测试清单。

## 验证

- `node --import tsx tmp/run-six-feature-checks.mts`：10个文件、43项测试通过。
- `npm.cmd run typecheck`：最终类型检查通过。
- 本次源码和测试ESLint：通过，零错误、零警告；仅规范自动修复。
- `npm.cmd run build`：通过，构建耗时53.7秒，日志 `tmp/six-feature-build.log`。
- `tmp/six-feature-isolated-smoke.mts`：在随机命名的独立临时数据库迁移完整结构并使用真实pg-boss队列，验证单任务取消、批次停止、已停止不再派发、模型迟到结果回滚、聊天与导出停止、失败区域重传及响应重放、跨账号拒绝、记录删除仍保留公式、不进入回收站、C路径收到年级目的、并发只扣一次、画像/熟练度/公式变更失效、库外ID降级。测试后仅删除该临时数据库；原数据库和任务不受影响。结果见 `artifacts/six-feature/isolated-result.json`。
- `tmp/six-feature-browser-smoke.mts`：临时账号验证真实停止接口和按钮右边界、重传位于失败状态左边、替换请求及成功结果保留、记录删除提示与实际公式保留、C推荐缓存刷新恢复、加号圆形且位于文本框之前、内外层入口、390px手机与1280px桌面无横向溢出、浏览器错误0。OCR与AI界面响应模拟，真实服务逻辑另外在独立数据库验证。临时账号结束后清理；结果与截图位于 `artifacts/six-feature/`。
- 兼容迁移005、006已应用，当前24项迁移完成；未重置账号、公式、图片或历史。核对时原账号2个、公式23条，测试不覆盖或修改这些记录。
- 已在确认待处理任务0后更新Worker和网页；最终构建后已重载网页（PID21524），Worker保持运行（PID7724）；最终手机/桌面复核通过，包括实际点击圆形加号打开文件选择器，浏览器错误0。

## 限制、风险与技术债务

本轮没有使用真实AI或识别模型消耗用户额度；AI排序正确性仍需用户结合实际学习情况核对。正在执行的模型调用依赖队列失效信号中止，可能有短暂延迟；已经验证即使迟到返回也不能写回。推荐候选来自现有公式库，不能当作完整课程知识图谱；需要重新生成时仍由用户点击。未引入新依赖或新的技术债务；缓存和停止状态为兼容的增量结构。

首次隔离运行暴露的批次CHECK限制已由006迁移修复；测试准备的复合外键、终态时间字段及同名弹窗定位问题已修正，不是最终失败。最终以两个result.json和当前测试/构建结果为准。
