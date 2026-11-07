# 本地告警邮件实施计划

- [x] 提取纯告警配置生成器；添加显式邮件开关，默认关闭；注册发信不变。
- [x] 更新使用说明和配置测试，验证默认无email集成、显式启用和非法开关。
- [x] 生成本地静默配置，amtool检查后热加载；确认健康、无邮件接收器及Prometheus规则继续工作，不发送测试邮件。

## 交付记录

- scripts/observability-alert-config.ts：纯开关解析及通知配置生成，默认无外部通知接收器。
- scripts/observability-credentials.ts：仅显式启用告警邮件时读取SMTP凭据，保留旧secret不输出，关闭模式新安装只创建无效占位文件。
- scripts/observability-secure.ps1：校验后热加载已有Alertmanager，失败明确退出；脚本语法已检查。
- tests/observability-notification.test.ts、tests/support/unit-files.ts：3项默认关闭/显式启用/错误值与配置回归，纳入现有单测。
- README.md、docs/OBSERVABILITY.md、本轮设计与计划：更新默认本地静默、部署显式开启方式与边界。

实测：189项Vitest通过；typecheck:tests、check:source-format、git diff --check与PowerShell语法检查通过；本地生成配置经amtool检查成功，热加载HTTP200，运行时确认无email_configs，Prometheus6条规则保留，业务登录页HTTP200，邮件通知计数保持10未增加。未发送测试邮件，注册验证码代码和SMTP配置未改动。未重新执行完整观测容器启动/初次安装流程、未发送显式启用模式邮件；该模式配置由纯测试覆盖并保留原模板。无新依赖、数据库变更或通用框架；真实部署需显式开启，默认关闭是刻意策略。未自动提交或推送。
