# 架构决策

以下记录根据当前实现整理，说明现有选择的理由、替代方案和代价；不追溯虚构的决策日期或声称方案从未变化。状态均为“当前采用”，代码行为改变时同步更新。

| 决策                                         | 主题                                 |
| -------------------------------------------- | ------------------------------------ |
| [001](001-service-boundaries.md)             | Nuxt 业务入口、独立 Worker 与 Python |
| [002](002-account-isolation.md)              | 会话身份与账号/资源隔离              |
| [003](003-postgres-jobs.md)                  | PostgreSQL 队列、幂等与执行权        |
| [004](004-conversation-consistency.md)       | 持久化快照、对话恢复与内部内容绑定   |
| [005](005-private-resource-lifecycle.md)     | 私有对象与租约清理                   |
| [006](006-owner-query-cache.md)              | owner 范围 Query 与写入回执          |
| [007](007-validation-boundaries.md)          | Zod 与专用校验的边界                 |
| [008](008-observability-and-verification.md) | 可选观测、隐私与隔离验证             |

[返回当前架构](../ARCHITECTURE.md)。临时实施清单不作为 ADR；新增 ADR 应解释需要长期维护的取舍，而不是记录某一轮完成了哪些文件。
