# 解释顺序与页面文案精简

## 已完成

- 首次提问放在结构化解释之前，后续追问保持原顺序；不重复显示原始结构化回答。
- 旧自动提问的“固定版本公式”仅在展示层转换为“请解释这个公式。”，不改历史数据或模型上下文。
- 解释历史只显示状态、时间和必要的模拟标记；对话普通来源使用 AI，隐藏具体模型名称。
- 删除结构化解释底部常驻提示、保存后说明、详情泛化提示、正常模式的服务商说明，缩短待确认说明。
- 保留失败与恢复操作、额度说明、模拟标记，以及解释正文里的数学条件和限制。

## 文件与原因

| 文件                                                                 | 原因                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| app/utils/explanation-layout.ts                                      | 组织首次提问与后续消息，兼容最近 100 条消息的截断窗口。 |
| app/components/AccountChat.vue                                       | 提问气泡前置，隐藏模型标识、精简生成与待确认说明。      |
| app/components/AccountFormulaExplanations.vue                        | 历史不展示模型名，压缩重复说明。                        |
| app/components/FormulaExplanationContent.vue                         | 移除固定底部提示，保留数学限制内容。                    |
| app/components/AccountFormulaEditor.vue                              | 删除冗余保存说明。                                      |
| app/components/AccountChatDraft.vue                                  | 正常模式不展示服务商说明，模拟模式仍明确标记。          |
| app/components/FormulaDetailContent.vue、app/pages/formulas/[id].vue | 删除泛化详情提示，避免留下空说明容器。                  |
| server/chat/mock-adapter.ts                                          | 模拟解释不再使用用户已移除的版本措辞。                  |
| tests/explanation-layout.test.ts、scripts/test-suite.ts              | 验证顺序、不重复、生成中和截断窗口兼容。                |
| tests/e2e/explanation-presentation.spec.ts                           | 真实隔离解释加追问，检查 320/390px 排序和历史模型隐藏。 |

## 验证

- npm run quality:quick：通过全部阶段，132 项单元测试通过，类型与生产构建、私密配置扫描通过。
- 隔离浏览器验收：1/1 通过，包含 320px 和 390px，两轮均验证首次提问、解释、后续追问的顺序，以及历史不包含模型标识。
- 实际开发页面已检查：旧解释的初始问题在上方，历史条目不再显示 deepseek-flash。
- git diff --check 通过。未改数据库、历史消息和备份。未重复运行全套集成与四视口旧 E2E，本轮针对展示逻辑验证。

## 风险与兼容

历史消息仍保持原始内容，只调整展示；超出消息窗口的初始请求用统一解释问法显示，后续消息不被误移。未增加依赖或数据库迁移。真机键盘和触控本轮未测。
