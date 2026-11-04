# TanStack Query Round 1 Implementation Plan

**Goal:** 将公式库与分类读取迁入单一账号隔离Query缓存。
**Spec:** ../specs/2026-11-04-query-round1-design.md
**Architecture:** Nuxt插件按实例创建QueryClient与SSR状态；业务query options集中在app/queries；Nuxt composable只连接路由、确认身份及既有fetch。

- [x] 固定安装Vue Query5.105.3运行依赖；添加统一key、默认配置、列表infinite options与分类options。
- [x] 添加Nuxt插件与SSR dehydration/hydration；接入account-boundary清理和显式plugin依赖，删除页面重复身份清理。
- [x] 替换useAccountLibrary手工分页/缓存，新增分类读取composable；列表与分类选择器共同使用一个缓存；加载更多失败保留已有数据。
- [x] 保留旧写接口，添加统一formula views invalidation并连接创建/编辑/删除/识别完成；收藏成功保留既有就地更新并阻止旧分页回写。
- [x] Vitest覆盖共享缓存、筛选竞态、无凭据、换号、分页/失败、失效与水合；vue-tsc检查实际composable与组件。
- [x] 添加隔离Query浏览器测试入口，实际验证SSR水合与账号隔离；运行quality:quick和定向E2E，记录范围、文件用途及收益/剩余工作。

沿用main工作区与用户已确认方案，保留其他功能；不创建分支，不自动提交。

验收：quality:quick全部通过（35项Node、143项Vitest、协议、类型、构建与私有配置扫描）；test:e2e:queries最终复验通过，专用容器核验清理。交付详情见../../query-round1-delivery.md。
