# TanStack Query 第二轮交付（2026-11-04）

## 实现与边界

本轮迁移创建、编辑、删除、收藏、公式分类分配与分类CRUD写入。useAccountMutation负责Vue Query状态、同步执行锁、owner快照与取消；useFormulaMutations逐项列出业务端点/请求体。创建的回执恢复仍在useManualFormulaCreation，不套通用乐观更新。

retry=false，networkMode=always，gcTime=0：离线尝试直接失败，不在恢复网络后静默重放写入。换号、未确认身份或卸载后的旧响应不触发成功处理；中止请求不等于服务器撤销已经提交的写入。创建结果不确定时仍用同一requestKey和body确认；明确的业务拒绝才清除回执，存储失败则不发送请求。

成功后按owner统一失效，普通查询失败不会触发写重试。收藏在服务端确认后更新所有已缓存列表的已有记录，取消收藏移除收藏视图；删除移除各缓存中的条目。先取消旧列表请求，防止忽略abort的旧响应覆盖新结果。不凭空插入筛选列表，最终成员/排序通过失效读取确认。编辑冲突保留草稿。

组件仅处理表单、提示、弹窗和当前详情快照，移除重复刷新。分类数据变化时校验URL中已删除分类并返回全部。后端requireAccountWriter集中校验可选x-account-id，原无此头调用保持兼容，CSRF与会话授权继续生效。

## 文件与原因（第二轮增量）

| 文件                                                                          | 原因                                                     |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| app/composables/useAccountMutation.ts                                         | 共享写入生命周期与取消判断                               |
| app/composables/useFormulaMutations.ts                                        | 编辑、删除、收藏、分配与分类CRUD的明确业务请求及成功通知 |
| app/queries/formula-cache.ts                                                  | 按账号跨列表应用服务端确认的收藏/删除结果，取消旧读取    |
| app/queries/formula-queries.ts、app/composables/useAccountLibrary.ts          | 删除第一轮仅更新当前列表的收藏路径                       |
| app/composables/useAccountFavorite.ts                                         | 保留提示/返回值，写入委托领域mutation                    |
| app/composables/useManualFormulaCreation.ts                                   | 使用mutation生命周期，保留回执与错误分类                 |
| app/composables/useAccountFormula.ts                                          | 只更新当前详情，避免二次通知缓存                         |
| app/components/AccountFormulaEditor.vue                                       | 编辑使用mutation，保留冲突重读和草稿校验                 |
| app/components/AccountCategoryPicker.vue、AccountCategoryManager.vue          | 去除重复busy/控制器/HTTP写入                             |
| app/components/AccountFormulaCard.vue、AccountLibrary.vue                     | 不再靠逐层收藏事件更新缓存；删除重复分类刷新             |
| app/components/ManualFormulaCreator.vue                                       | 中止/换号后不继续显示旧保存反馈                          |
| app/pages/formulas/[id].vue                                                   | 删除使用相同认证与诊断fetch链路，使用mutation忙碌状态    |
| server/utils/auth.ts                                                          | writer入口统一预期账号校验                               |
| server/api/account/formulas/index.post.ts、formulas/[id]/explanations.post.ts | 移除已统一到writer的重复校验                             |
| tests/components/formula-mutation.test.ts                                     | 真Vue Query挂载，验证并发/取消/失败/缓存与回执边界       |
| tests/components/formula-query.test.ts                                        | 移除已替换的当前列表收藏专用测试，迁移到跨列表测试       |
| tests/e2e/query-library.spec.ts                                               | 扩展分类CRUD、分配、失败手动重试、丢响应创建重放与删除   |
| vitest.config.ts                                                              | 将mutation和创建恢复实现纳入覆盖率                       |
| README.md、第二轮设计/计划及本文                                              | 记录实施边界、命令与实际验收                             |

## 验证记录

- `npm run quality:quick`通过：客户端生成、格式、静态资源、类型检查、35项Node基础设施测试、156项Vitest测试、协议测试、隔离生产构建与私有配置扫描。
- 新增14项mutation/回执挂载测试，替换第一轮1项当前列表收藏测试，测试总数净增13项。
- `npm run test:e2e:queries`最终复验通过（40秒），390px验证SSR、缓存、收藏/编辑、分类CRUD/分配/错误手动重试、创建成功但丢响应后的同请求重放（数据库仅1条）、删除与退出换号。新增的当前分类删除后自动返回全部场景也已通过；专用容器已核验清理。
- `npm run test:isolated`通过：232项后端集成测试，0失败；数据库/对象存储专用容器2个已核验清理，未操作开发资源。
- `git diff --check`通过。

## 未覆盖范围

未迁移聊天、识别提交、导出或个人资料写入；这些操作已有各自异步任务/恢复协议，不能机械替换。未更改数据库、真实模型或生产服务；本轮未自动提交/push。故障验收中使用现有“关闭诊断提示”按钮后继续操作；窄屏诊断浮层的遮挡可在第三轮布局复查中处理。第三轮仍需更广的页面/视口回归与最终清理，定向390px测试不能替代全部设备验收。
