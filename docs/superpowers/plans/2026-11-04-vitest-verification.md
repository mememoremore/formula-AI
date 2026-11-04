# Vitest 接入验收（2026-11-04）

用户确认后在现有main工作区实施；此前未提交的部署文件保留。本轮不改数据库、模型或云端服务，不自动提交/push。

## 改动及原因

| 文件                                                                 | 原因                                                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| package.json、package-lock.json                                      | 固定开发依赖Vitest5.1.0、匹配coverage-v8、Vue Test Utils2.5.1、happy-dom21.0.4、Vue插件6.0.10；增加监听、组件与覆盖率命令 |
| vitest.config.ts                                                     | 显式logic/components项目、测试白名单、支持目录envDir、真实覆盖率范围；不加载根.env                                        |
| scripts/test-vitest.ts                                               | 清洗运行环境、限制模式、调用Vitest并传递退出码/信号                                                                       |
| tests/support/unit-files.ts                                          | 单一登记基础设施与逻辑测试文件，避免遗漏原用例或误发现集成测试                                                            |
| scripts/test-suite.ts                                                | 保留Node基础设施测试，unit成功后顺序运行Vitest；原集成和协议分支不变                                                      |
| tests/support/vitest-setup.ts                                        | 每worker清洗环境、安装既有网络守卫，直接运行CLI也有效                                                                     |
| tests/support/component-setup.ts                                     | 自动卸载挂载组件，避免测试间残留                                                                                          |
| tests/vitest-safety.test.ts                                          | 验证凭据清洗与公网/开发数据库/对象存储连接拒绝                                                                            |
| tests/components/chat-composer.test.ts                               | 6项真实组件交互：空白、v-model、Enter/换行/IME、禁用、停止防重复、卸载布局清理                                            |
| tests/components/task-progress.test.ts                               | 5项状态测试：排队、处理中、完成、失败恢复提示、警告文案                                                                   |
| app/components/ChatComposer.vue、TaskProgress.vue                    | 显式导入原本由Nuxt自动导入的Vue API，供独立组件挂载；不改业务行为                                                         |
| 25个既有逻辑测试文件                                                 | 仅将node:test的test导入换为vitest，全部既有断言保留                                                                       |
| tsconfig.database.json、tsconfig.vitest.json、scripts/check-types.ts | 普通tsc与vue-tsc分别检查后端/逻辑和SFC组件测试，没有用宽泛any声明掩盖.vue类型                                             |
| scripts/check-quality.ts                                             | unit阶段执行Vitest覆盖率，安全输出数值摘要，不修改CI产物白名单                                                            |
| README.md、同日spec/plan及本记录                                     | 记录命令、职责、范围、验证和限制                                                                                          |

测试登记文件：

- tests/test-environment.test.ts
- tests/ci-policy.test.ts
- tests/node-forge.test.mjs
- tests/public-assets.test.ts
- tests/navigation.test.ts
- tests/home.test.ts
- tests/library-state.test.ts
- tests/formula-editor.test.ts
- tests/manual-formula.test.ts
- tests/explanation.test.ts
- tests/explanation-layout.test.ts
- tests/image-crop.test.ts
- tests/recognition-state.test.ts
- tests/recognition-result.test.ts
- tests/chat-state.test.ts
- tests/chat-protocol.test.ts
- tests/chat-content.test.ts
- tests/account-state.test.ts
- tests/account-cache.test.ts
- tests/profile.test.ts
- tests/resource-policy.test.ts
- tests/task-recovery-policy.test.ts
- tests/lease-recovery-policy.test.ts
- tests/server-diagnostics.test.ts
- tests/deployment-boundaries.test.ts
- tests/tracing.test.ts
- tests/browser-errors.test.ts
- tests/metrics.test.ts
- tests/export-state.test.ts
- tests/vitest-safety.test.ts

## 已执行验证

- npm run test:vitest：28文件、129项通过，其中116项为迁移的既有断言，11项新增组件测试、2项新增安全测试。
- npm run test:coverage：129项通过，生成HTML和JSON摘要；行88.73%、分支80.50%、函数88.11%、语句86.15%。统计app/utils、shared业务工具与两个组件，类型文件不统计；未覆盖模块保留0%。不是整个全栈系统覆盖率，也不是提高到该百分比的前后对比。
- 向环境注入人工假NUXT_DATABASE_URL/AI key/SMTP password，再直接运行Vitest安全测试（绕过npm包装）：2/2通过，未实际连接外部目标。
- 组件测试由vue-tsc检查，既有后端和逻辑由tsc检查。初次普通tsc不能解析.vue，已分离正确类型检查范围并复测成功。
- npm run quality:quick：generate、format、assets、types、unit、protocols、build-and-private-scan全部exit0。unit保留Node35项+Vitest129项，共164项，原151项均保留并新增13项。
- npm run test:components：仅2组件文件11项通过。
- git diff --check通过；覆盖率位于忽略的artifacts/coverage，私密配置不进Git。

## 限制

本轮未重跑Docker数据库集成与Playwright全流程，因为其运行路径和服务实现未改变；既有CI仍会执行integration，browser仍按既有手动触发策略。未推送GitHub，不宣称远端CI通过。组件采用happy-dom，不能证明真实移动端键盘、相机、布局或滚动行为；没有为所有Nuxt页面/组合函数建立框架运行时测试。覆盖率暂不设置任意全局阈值，后续按业务风险补分支。新增开发依赖和两种保留的测试运行器会增加维护成本，README及统一入口用于明确职责；生产运行不依赖Vitest。
