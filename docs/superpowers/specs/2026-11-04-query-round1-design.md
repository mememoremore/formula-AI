# TanStack Query 第一轮设计（2026-11-04）

用户已确认三轮迁移，当前只实施第一轮：基础设施、公式库/收藏列表与分类读取。采用@tanstack/vue-query5.105.3，复用现有useAccountFetch（SSR转发Cookie、浏览器诊断）。不迁移mutation API，不改变数据库、既有接口响应、SSE和任务执行语义。

每个Nuxt实例创建独立QueryClient；SSR渲染后dehydrate到专用useState，浏览器插件hydrate后释放这份一次性状态。不存在模块级全局客户端，不持久化到localStorage。queries staleTime30秒，inactive gc5分钟（SSR Infinity并在渲染后clear），retry关闭，窗口焦点不自动刷新。

统一key以account-formula-views/owner为前缀，列表key包含kind与URL中已提交的q/category；游标由useInfiniteQuery维护，不把已有列表另存Nuxt缓存。分类使用同一owner下的query供列表和选择器共享。查询只有当前会话身份与消费者owner一致才启用/展示；未确认身份不执行SSR suspense；无跨筛选placeholderData。所有请求透传signal并在响应后检查取消。

账号边界依赖Query插件，在确认换号/退出时清空QueryClient并取消旧查询。现有写操作继续使用原接口，只增加统一失效通知：清理仍由Nuxt管理的历史/首页视图，并标记新公式/分类查询失效。收藏列表保留原就地更新语义，更新前取消正在读取的旧分页，其他缓存列表标记失效。本轮不保留同一份数据的两套缓存。

验证：Vitest实际Vue Query挂载，覆盖key、共享、筛选旧响应、游标去重、失败保留、账号切换与取消、旧写入失效、SSR客户端隔离/水合。隔离Playwright以真实认证/数据库/S3验证SSR首屏和浏览器无重复请求、筛选返回缓存、收藏/编辑后刷新及退出换号。所有外部AI/发信使用既有隔离替身；最终运行quality:quick，报告真实结果。不上云、不自动push。

实现补充：列表与分类GET携带可选x-account-id预期账号头，后端与真实会话核对，不一致返回403；无此头的原调用保持兼容。缓存数据遇到401/403不继续展示。
