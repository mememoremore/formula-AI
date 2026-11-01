# 移除公式版本产品机制实施记录

用户已确认：公式只展示当前内容，编辑直接保存，不再选择或管理 v1/v2。

## 范围与数据兼容

已移除版本编号、版本选择、版本历史弹窗及相关说明。新对话通过 formulaId 读取当前公式；导出当前内容。历史任务的不可变内容引用、旧 API 和数据库结构保留，以保证对话、幂等重试及已提交导出不失效。底层仍保存兼容内容记录，本次没有物理清除版本表或旧数据。

## 文件与原因

| 文件                                            | 原因                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `README.md`                                     | 更新功能清单和底层兼容边界。                                       |
| `app/components/AccountCategoryManager.vue`     | 移除对话、列表、导出或辅助界面的版本文案与编号。                   |
| `app/components/AccountChat.vue`                | 移除对话、列表、导出或辅助界面的版本文案与编号。                   |
| `app/components/AccountChatDraft.vue`           | 新对话按 formulaId 读取当前公式，保留旧链接兼容。                  |
| `app/components/AccountConversations.vue`       | 移除对话、列表、导出或辅助界面的版本文案与编号。                   |
| `app/components/AccountExport.vue`              | 取消导出版本选择，预览并导出当前公式。                             |
| `app/components/AccountExportTask.vue`          | 移除对话、列表、导出或辅助界面的版本文案与编号。                   |
| `app/components/AccountFormulaEditor.vue`       | 删除版本编辑提示，使用当前公式 PATCH 保存入口。                    |
| `app/components/AccountFormulaExplanations.vue` | 取消解释版本选择和全部版本筛选，历史按公式汇总。                   |
| `app/components/AccountLibrary.vue`             | 移除对话、列表、导出或辅助界面的版本文案与编号。                   |
| `app/components/DemoChat.vue`                   | 移除对话、列表、导出或辅助界面的版本文案与编号。                   |
| `app/components/ExportResult.vue`               | 移除对话、列表、导出或辅助界面的版本文案与编号。                   |
| `app/components/FormulaDetailContent.vue`       | 删除版本编号、版本记录入口和相关组件属性。                         |
| `app/components/FormulaVersions.vue`            | 删除不再使用的版本管理弹窗。                                       |
| `app/pages/about.vue`                           | 移除版本入口、链接参数或对应说明，使用当前公式流程。               |
| `app/pages/ai/index.vue`                        | 移除版本入口、链接参数或对应说明，使用当前公式流程。               |
| `app/pages/ai/new.vue`                          | 移除版本入口、链接参数或对应说明，使用当前公式流程。               |
| `app/pages/formulas/[id].vue`                   | 移除版本入口、链接参数或对应说明，使用当前公式流程。               |
| `app/pages/help.vue`                            | 移除版本入口、链接参数或对应说明，使用当前公式流程。               |
| `app/pages/index.vue`                           | 移除版本入口、链接参数或对应说明，使用当前公式流程。               |
| `app/pages/result/[id].vue`                     | 移除版本入口、链接参数或对应说明，使用当前公式流程。               |
| `server/database/conversations.ts`              | 新对话不生成版本标题，兼容已有带编号标题的显示。                   |
| `server/database/explanations.ts`               | 新解释标题不再附带公式版本编号。                                   |
| `server/documents/formula-document.ts`          | Word 正文移除公式版本编号。                                        |
| `server/worker/export.ts`                       | 新生成的 Word 文件名移除版本后缀。                                 |
| `tests/design-preview/detail-fixtures.ts`       | 同步已移除控件的回归断言与当前公式预期。                           |
| `tests/documents.test.ts`                       | 同步已移除控件的回归断言与当前公式预期。                           |
| `tests/e2e/journey.spec.ts`                     | 同步已移除控件的回归断言与当前公式预期。                           |
| `tests/e2e/r18.spec.ts`                         | 同步已移除控件的回归断言与当前公式预期。                           |
| `tests/e2e/r19.spec.ts`                         | 同步已移除控件的回归断言与当前公式预期。                           |
| `tests/jobs.test.ts`                            | 同步已移除控件的回归断言与当前公式预期。                           |
| `tests/workspace.test.ts`                       | 同步已移除控件的回归断言与当前公式预期。                           |
| `server/api/account/formulas/[id].patch.ts`     | 复用现有鉴权、归属、校验和冲突保护，为当前公式提供 PATCH 保存。    |
| `tests/e2e/current-formula.spec.ts`             | 390px 实测修改后提问与 Word 导出均使用当前公式，无版本控件或编号。 |

## 验证

- `npm run quality:quick`：通过生成、格式、资源、类型、127 项单元测试、协议测试、构建与私密配置扫描。
- 390px 隔离浏览器回归：1/1 通过，验证编辑、提问、下载及无横向溢出。
- `npm run test:documents`：7/7 通过。
- 隔离集成测试：通过（exit=0，178 秒）；测试容器清理完成，未操作开发资源。

## 实际限制与后续

未跑本轮完整 320/430/1440px 浏览器矩阵，未做真实手机键盘与触控测试。未重构历史数据关联；旧数据库模型和兼容 API 仍存在，这是明确保留的兼容负担。开发 Worker 已在无进行中任务时重载。备份与 model 未操作。
