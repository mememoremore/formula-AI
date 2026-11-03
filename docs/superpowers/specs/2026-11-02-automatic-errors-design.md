# 自动错误中心设计

用户已选择先放在 Grafana，完成自动采集与集中排查；不做主动反馈和数据库变更。

## 范围

沿用已有浏览器异常入口、workspaceRequest、Worker 生命周期和 Python 识别中间件。启用观测时自动写入专用安全日志，经 Alloy 到 Loki。新增 Grafana 看板 formula-errors，四项事件计数与统一中文错误列表，附前端异常分组和任务失败分组。

纳入：browser.error；http.operation 且 status>=500；worker.attempt 且 outcome=failed；recognition.request 且 status>=500。排除正常4xx、取消、自动重试和失去领取权；最终失败才进入任务错误列表。来源分别为 formula-browser、formula-api、formula-worker、formula-recognition。

日志显示来源、错误类型/代码、页面或业务操作、时间、已有请求/任务编号；保留原始 traceId 匹配格式以继续使用“查看链路”。计数是已收到事件数，不是去重故障数，也不是受影响用户数。前端分组仅按已有安全 fingerprint，不引入原始 message/stack。

现有框架内部、登录前异常、被主动吞掉且未记录的异常、离线丢失以及无异常的排版错误不保证覆盖。不将“0条记录”宣称为没有bug。邮件继续沿用已有阈值，不对每条异常发信。

## 取舍

推荐复用 Grafana/Loki：无需新业务表和管理员授权体系；代价是不能做反馈处理工单。项目内管理页需要新增后端接口、管理员权限和存储；专用错误平台会再增加服务及运维，本轮不引入。

## 验证

使用独立、无业务挂载的临时 Loki，写入公开合成事件，实际执行看板查询，核对四类计数、去噪、分组、链路ID提取、空样本0；删除时核对容器归属标签。再通过真实 Grafana API 验证新看板装载、所有查询成功及来源链路配置。此前 Grafana 浏览器自动审批因额度拒绝，不能绕过，也不宣称人工视觉通过。
