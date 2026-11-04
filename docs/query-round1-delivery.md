# TanStack Query 第一轮交付（2026-11-04）

## 范围与实现

本轮只迁移公式库、收藏列表与分类读取。既有认证、请求诊断、写接口、SSE和任务恢复机制保持职责独立。QueryClient按Nuxt实例创建，服务端无跨用户共享；浏览器水合后释放一次性传输状态。URL保存已提交筛选，Query保存结果与游标，组件只连接两者，不另存一份列表缓存。

默认缓存新鲜期30秒、未使用缓存回收期5分钟，不自动重试或在窗口聚焦时刷新。未确认账号不查询、不等待禁用查询的suspense；账号/筛选改变时立即屏蔽旧观察值，取消信号传入请求。新查询附带预期账号，后端真实会话不匹配则403，不能把其他标签页的新账号响应放入旧账号缓存。401/403隐藏旧内容，普通分页失败保留已有内容与游标。

写操作仍走原接口：创建、编辑、删除、识别完成和分类修改通知新缓存失效，同时清理仍由Nuxt管理的首页/历史缓存。收藏更新当前列表前取消旧分页，其他列表变体标记失效。本轮不引入mutation通用封装。

## 文件与原因

| 文件（仓库相对路径）                                                                                                   | 职责与修改原因                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| package.json、package-lock.json                                                                                        | 固定Vue Query版本，添加定向浏览器测试命令                         |
| app/queries/formula-queries.ts                                                                                         | 集中账号key、查询配置、缓存默认值、收藏更新、失效与当前观察值判断 |
| app/plugins/account-query.ts                                                                                           | 每实例QueryClient和SSR水合                                        |
| app/plugins/account-boundary.ts                                                                                        | 显式依赖Query插件，退出/换号清空查询并取消请求                    |
| app/composables/useAccountQueryOwner.ts                                                                                | 确认会话身份与组件账号一致                                        |
| app/composables/useAccountLibrary.ts                                                                                   | 用无限查询替换手写缓存、分页和请求控制器                          |
| app/composables/useAccountCategories.ts                                                                                | 列表与分类选择器共享分类读取                                      |
| app/composables/useFormulaViewsInvalidation.ts                                                                         | 桥接新Query与旧首页/历史缓存通知                                  |
| app/components/AccountLibrary.vue、AccountCategoryPicker.vue                                                           | 使用新读取，保留界面与现有分类写入                                |
| app/pages/library.vue                                                                                                  | 删除重复账号边界处理                                              |
| app/composables/useAccountFormula.ts、useManualFormulaCreation.ts                                                      | 编辑/创建成功后通知读取失效                                       |
| app/pages/formulas/[id].vue                                                                                            | 删除后通知失效，并检查异步删除后的账号边界                        |
| app/components/AccountRecognitionTask.vue                                                                              | 识别完成通知公式与分类缓存更新                                    |
| server/api/account/library.get.ts、categories/index.get.ts                                                             | 可选预期账号校验，原无请求头调用兼容                              |
| tests/formula-queries.test.ts                                                                                          | key、客户端隔离、水合复用、按账号失效                             |
| tests/components/formula-query.test.ts                                                                                 | 真实Vue Query组合函数测试，覆盖共享、取消、分页、失败与换号       |
| tests/e2e/query-library.spec.ts                                                                                        | 独立数据库下真实认证与390px浏览器验收                             |
| tests/support/unit-files.ts、vitest.config.ts                                                                          | 纳入单测白名单及覆盖率范围                                        |
| scripts/test-isolated.ts、.github/workflows/quality.yml                                                                | 独立queries验收组，接入手动完整浏览器CI                           |
| README.md、docs/superpowers/specs/2026-11-04-query-round1-design.md、docs/superpowers/plans/2026-11-04-query-round1.md | 使用说明、设计与执行记录                                          |

## 验证

定向浏览器验收已通过：两个独立SSR账号内容隔离；首屏水合后列表/分类浏览器GET均0次；搜索与分类各发新读取，清空或返回全部复用缓存不增加读取；20条加载到22条；收藏/取消收藏、编辑后返回更新、分类选择器共享与同一浏览器退出后登录B验证通过。测试资源已按标签核验清理，没有连接开发数据库。

定向浏览器最终复验通过，耗时39秒，专用容器2个已核验清理。

最终 `npm run quality:quick` 全部通过：客户端生成、格式、素材、类型、35项Node基础设施测试、143项Vitest测试、协议测试、隔离生产构建与私有配置扫描。声明的前端/shared统计范围行覆盖率90.1%、分支81.05%；此数字不代表全应用覆盖率。`git diff --check`通过。

## 下一轮与限制

下一轮再整理mutation生命周期与跨页面失效策略。本轮没有迁移历史、详情和任务读取，没有评估真实模型效果、生产负载或云端发布，也没有验证真实手机键盘/相机。SSR水合仍有传输成本，缓存复用不等于所有场景零请求。未提交或推送GitHub。
