# Query第二轮实施计划

**Goal:** 将公式与分类写入接入useMutation，统一缓存一致性并保留恢复边界。
**Architecture:** useAccountMutation负责生命周期；useFormulaMutations负责明确业务请求；formula-cache负责服务器确认后的缓存改动；组件只负责表单/UI。
**Tech Stack:** Nuxt4、Vue3、TypeScript、Vue Query5.105.3、Vitest、Playwright。
**Spec:** ../specs/2026-11-04-query-round2-design.md

约束：不改schema/模型/备份，不引入自动写重试，不提交Git。沿用已授权main工作区。

- [x] 添加useAccountMutation与formula-cache；真实Vue Query挂载测试覆盖双击、离线、账号变化、卸载、缓存隔离。
- [x] 添加明确的编辑/删除/收藏/分类领域组合函数；预期账号校验放到现有writer认证入口。
- [x] 迁移编辑、删除、收藏、分类组件；移除组件重复失效与手写写入控制器，保留草稿与编辑冲突读取。
- [x] 迁移手动创建生命周期，保留回执存储、同请求重放和错误分类；补回执恢复测试。
- [x] 扩展隔离浏览器用例，验证真实分类CRUD/创建/删除/失败重试；完成类型、单测、协议、构建、私有配置检查与交付文档。

验收完成：quality:quick全部通过（35项Node、156项Vitest、协议、类型、生产构建和私有配置扫描）；test:isolated 232/232通过；test:e2e:queries最终40秒通过，新增当前分类删除回退及丢响应重放验证。专用资源已核验清理；详情见../../query-round2-delivery.md。未提交或推送。
