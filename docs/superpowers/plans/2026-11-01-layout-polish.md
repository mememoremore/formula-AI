# 手机端逐页排版优化实施计划

已批准设计：docs/UI_AUDIT_2026-11-01.md。保留浅紫风格、现有鉴权、草稿、任务幂等及历史数据；不修改数据库结构。

- [x] 详情：AI 操作移到公式下，编辑/复制/导出同一工具行，删除收进更多，压缩标题与短公式空白。
- [x] 列表与首页：压缩公式卡，最近对话显示问题摘要而非重复公式或假缩略图。
- [x] 上传与手动输入：设置合组、空态缩小，源码输入按内容增高，额度折叠。
- [x] 状态：补充结果可用/已删除/缺关联状态，任务与历史清楚表达；状态逻辑覆盖测试。
- [x] AI：精简列表标题，新建页按有无公式显示不同问题；公式摘要、正文间距、选择抽屉优化。
- [x] 辅助页：设置与帮助连续折叠行，服务去重，反馈增加明确 GitHub 手动提交渠道，个人资料轻调整。
- [x] 质量、隔离集成和 320/390/430/1440 浏览器测试；实际浏览复查，保存截图与变更记录。

## 验证与兼容边界

- npm run quality:quick：通过生成、格式、资源、类型、130 项单元测试、协议测试、生产构建和私密配置扫描。
- 隔离集成：228/228 通过，覆盖新统计接口的账号隔离和已删除识别结果的 DTO。
- tests/e2e/layout-polish.spec.ts：320、390、430、1440px 全部页面循环通过；验证首屏 AI、卡片尺寸、无横向溢出、等宽图片来源按钮、输入增长、公式抽屉固定搜索、帮助展开、反馈链接、真实统计；最后真实上传图片、模拟识别、软删除后验证状态。
- 浏览器首轮末尾使用网络拦截夹具时 SSR 无法读到夹具而失败；已改成真实隔离任务，复跑通过。
- 开发实例实测：390×844 的一键解释从约 1141px 提前至约 524px；旧任务已明确显示公式已删除。
- 测试容器均清理，未修改开发数据库结构。已有公式、对话、备份与 model 未删除。
- 反馈提供复制加 GitHub 手动提交，不在站内自动收信或发送；用户需要 GitHub 登录。没有增加新的依赖。
- 未执行完整旧 E2E 全套矩阵；本轮新增逐页四宽度用例通过。未验证真实手机相机权限、软键盘和触控。

## 文件与原因

| 文件                                            | 本轮原因                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `app/components/FormulaDetailContent.vue`       | 公式下方优先展示 AI；辅助工具同排，删除收起，历史折叠及锚点展开。                          |
| `app/pages/formulas/[id].vue`                   | 公式下方优先展示 AI；辅助工具同排，删除收起，历史折叠及锚点展开。                          |
| `app/components/AccountFormulaExplanations.vue` | 公式下方优先展示 AI；辅助工具同排，删除收起，历史折叠及锚点展开。                          |
| `app/components/FormulaListCard.vue`            | 紧凑标题与日期、减少短公式空白，保留长公式横向滚动。                                       |
| `app/components/RecentEntryCard.vue`            | 最近对话突出问题摘要，不重复数学预览或空缩略图。                                           |
| `app/pages/upload.vue`                          | 空图片区缩小，名称/模式合组，额度折叠，保留等宽来源按钮和固定提交。                        |
| `app/components/UploadImageCard.vue`            | 空图片区缩小，名称/模式合组，额度折叠，保留等宽来源按钮和固定提交。                        |
| `shared/recognition-result.ts`                  | 增加兼容的结果可用、已删除、缺关联状态，历史普通查询和搜索一致。                           |
| `shared/types/tasks.ts`                         | 增加兼容的结果可用、已删除、缺关联状态，历史普通查询和搜索一致。                           |
| `server/database/task-queries.ts`               | 增加兼容的结果可用、已删除、缺关联状态，历史普通查询和搜索一致。                           |
| `app/components/AccountRecognitionTask.vue`     | 完成态按真实结果显示；刷新接受删除变化并阻止迟到数据恢复已删除结果，随机文件名不作为标题。 |
| `app/components/TaskProgress.vue`               | 完成态按真实结果显示；刷新接受删除变化并阻止迟到数据恢复已删除结果，随机文件名不作为标题。 |
| `app/components/AccountHistory.vue`             | 完成态按真实结果显示；刷新接受删除变化并阻止迟到数据恢复已删除结果，随机文件名不作为标题。 |
| `app/utils/recognition-state.ts`                | 完成态按真实结果显示；刷新接受删除变化并阻止迟到数据恢复已删除结果，随机文件名不作为标题。 |
| `app/components/ManualFormulaCreator.vue`       | 源码输入初始 168px 并随内容增长，简化预览空态。                                            |
| `app/pages/ai/index.vue`                        | 压缩会话页宣传区及卡片，省略无信息占位摘要。                                               |
| `app/components/AccountConversations.vue`       | 压缩会话页宣传区及卡片，省略无信息占位摘要。                                               |
| `app/components/AccountChat.vue`                | 公式摘要替代重复名称，正文间距适度收紧；无公式时使用通用问题，有公式时给对应问法。         |
| `app/components/ChatMessageContent.vue`         | 公式摘要替代重复名称，正文间距适度收紧；无公式时使用通用问题，有公式时给对应问法。         |
| `app/components/AccountChatDraft.vue`           | 公式摘要替代重复名称，正文间距适度收紧；无公式时使用通用问题，有公式时给对应问法。         |
| `app/components/AppModal.vue`                   | 只滚动选择列表，标题和搜索固定；手机抽屉与桌面弹窗分别适配。                               |
| `app/components/FormulaContextPicker.vue`       | 只滚动选择列表，标题和搜索固定；手机抽屉与桌面弹窗分别适配。                               |
| `app/pages/settings.vue`                        | 移除重复标题，折叠行紧凑且带状态箭头，连接状态去重。                                       |
| `app/components/ServiceStatus.vue`              | 移除重复标题，折叠行紧凑且带状态箭头，连接状态去重。                                       |
| `app/pages/help.vue`                            | FAQ 连续分隔，步骤与辅助字更清楚。                                                         |
| `app/pages/feedback.vue`                        | 补充明确的 GitHub 公开 Issue 去向，复制与发送行为分清。                                    |
| `app/pages/profile/index.vue`                   | 账号隔离的一致性统计，展示真实公式、收藏、对话数量；失败时不伪造零。                       |
| `server/api/account/profile-stats.get.ts`       | 账号隔离的一致性统计，展示真实公式、收藏、对话数量；失败时不伪造零。                       |
| `app/components/AccountProfileEditor.vue`       | 简化资料标题，辅助文字加深与字号统一，品牌页保留留白。                                     |
| `app/components/EmptyState.vue`                 | 简化资料标题，辅助文字加深与字号统一，品牌页保留留白。                                     |
| `app/pages/about.vue`                           | 简化资料标题，辅助文字加深与字号统一，品牌页保留留白。                                     |
| `app/assets/css/tokens.css`                     | 简化资料标题，辅助文字加深与字号统一，品牌页保留留白。                                     |
| `tests/recognition-result.test.ts`              | 新增状态逻辑、刷新、防串号统计、搜索和四宽度实际交互验证。                                 |
| `tests/recognition-state.test.ts`               | 新增状态逻辑、刷新、防串号统计、搜索和四宽度实际交互验证。                                 |
| `tests/profile-api.test.ts`                     | 新增状态逻辑、刷新、防串号统计、搜索和四宽度实际交互验证。                                 |
| `tests/workspace.test.ts`                       | 新增状态逻辑、刷新、防串号统计、搜索和四宽度实际交互验证。                                 |
| `tests/e2e/layout-polish.spec.ts`               | 新增状态逻辑、刷新、防串号统计、搜索和四宽度实际交互验证。                                 |
| `scripts/test-suite.ts`                         | 新增状态逻辑、刷新、防串号统计、搜索和四宽度实际交互验证。                                 |
