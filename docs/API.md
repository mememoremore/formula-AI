# 当前接口说明

本文件描述产品使用的账号 API。完整路径和处理顺序以 [server/api/account](../server/api/account) 为准，输入结构以 [shared/schemas](../shared/schemas) 和服务端解析器为准。旧的 /api/recognitions、/api/chat、/api/formulas 属于兼容代码，不是新的公开账号协议。

## 公共约束

- 账号 API 使用 Better Auth 会话 Cookie。写操作检查 Origin/CSRF；可携带的 x-account-id 只用于账号错配保护，服务端不据此选取用户。
- 资源编号遵循现有 UUID 形状约束；查询必须同时限定 owner，外部账号资源不泄露存在性。
- JSON 操作需要 application/json；通用读取有 32 KiB 上限，资料图片等有单独限制。
- requestKey 标识一次逻辑写入。原键原请求可重放；原键改内容返回冲突。新的键代表新操作。
- 错误返回可展示的业务提示；不把 Zod issue 中的原始输入、内部堆栈或密钥直接发给客户端。
- 响应字段和 HTTP 细节应通过对应集成测试核对，不把所有接口强行包装成同一响应结构。

| 状态      | 常见原因                                     |
| --------- | -------------------------------------------- |
| 400       | 参数、JSON 或业务输入无效                    |
| 401 / 403 | 未登录 / Origin、账号或权限检查失败          |
| 404       | 资源不存在或不属于当前账号                   |
| 409       | 幂等键内容冲突、编辑预期不一致或当前状态冲突 |
| 413 / 415 | 请求过大 / 不支持的媒体类型                  |
| 429       | 注册发信限流或项目每日额度耗尽               |
| 503       | 所需服务未配置或暂不可用                     |

具体接口保留其校验优先级；不能由此表推断所有失败都映射为同一状态。

## 会话与资料

| 路径                        | 方法                | 用途                         |
| --------------------------- | ------------------- | ---------------------------- |
| /api/auth/*                 | 由 Better Auth 管理 | 登录、注册、退出、邮箱验证码 |
| /api/account/session        | GET                 | 当前账号和会话               |
| /api/account/profile        | PATCH               | 昵称和头像资料               |
| /api/account/avatar         | GET                 | 读取当前头像                 |
| /api/account/profile-stats  | GET                 | 个人页统计                   |
| /api/account/overview       | GET                 | 首页概览                     |
| /api/account/service-status | GET                 | 业务服务可用配置             |
| /api/account/usage          | GET                 | 账号额度                     |
| /api/account/chat-settings  | GET                 | 对话配置                     |

验证码由服务端通过 SMTP 发送；新账号验证成功才能正常登录。账号库的具体协议由认证库维护，不用自建 JSON schema 替代其密码或会话逻辑。

## 文件与识别

| 路径                             | 方法 | 输入或用途                                    |
| -------------------------------- | ---- | --------------------------------------------- |
| /api/account/files               | POST | JPEG/PNG 原始二进制请求体，不是 multipart     |
| /api/account/files/:id/content   | GET  | 经归属校验读取私有图片                        |
| /api/account/recognitions        | POST | fileId、requestKey、mode、可选 requestedTitle |
| /api/account/recognitions        | GET  | 识别历史，支持 q、cursor                      |
| /api/account/tasks/:id           | GET  | 识别任务当前状态                              |
| /api/account/resources/:kind/:id | GET  | 按受控资源种类读取状态                        |

上传带 Content-Type、x-upload-key 和 URL 编码的 x-file-name；实际文件仍需内容解码验证。识别 mode 为 handwritten 或 printed。图片成功上传不代表识别成功，提交返回任务后通过只读查询恢复状态，不重复 POST。

## 公式库

| 路径                               | 方法                 | 用途                                 |
| ---------------------------------- | -------------------- | ------------------------------------ |
| /api/account/library               | GET                  | 分类筛选与公式库聚合读取             |
| /api/account/formulas              | GET / POST           | 查询公式 / 幂等手动创建              |
| /api/account/formulas/:id          | GET / PATCH / DELETE | 详情 / 修改标题等 / 软删除           |
| /api/account/formulas/:id/versions | POST                 | 保存编辑后的公式内容（内部内容快照） |
| /api/account/formulas/:id/favorite | PUT                  | 设置收藏状态                         |
| /api/account/formulas/:id/category | PUT                  | 设置分类                             |
| /api/account/versions/:id          | GET                  | 读取绑定的内部公式内容               |
| /api/account/categories            | GET / POST           | 分类列表 / 创建                      |
| /api/account/categories/:id        | PATCH / DELETE       | 改名 / 删除分类                      |

手动创建的输入和恢复回执分别使用“新提交归一化”和“原样验证”规则，不能恢复时再次改写请求。公式内容编辑和重命名依赖预期状态，避免覆盖另一标签页的修改。页面不需要让用户选择内容版本。查询过滤字段、长度及分页规则见领域 schema。

## 解释、对话与导出

| 路径                                                | 方法       | 输入或用途                                      |
| --------------------------------------------------- | ---------- | ----------------------------------------------- |
| /api/account/formulas/:id/explanations              | GET / POST | 解释历史 / 提交 versionId、requestKey           |
| /api/account/conversations                          | GET / POST | 会话列表 / formulaVersionId（可空）、requestKey |
| /api/account/conversations/:id                      | GET        | 会话快照                                        |
| /api/account/conversations/:id/messages             | POST       | question、requestKey                            |
| /api/account/conversations/:id/events               | GET        | SSE 会话快照                                    |
| /api/account/conversations/:id/turns/:turnId/cancel | POST       | 停止指定活动轮次                                |
| /api/account/exports                                | POST       | formulaVersionId、requestKey                    |
| /api/account/exports/:id                            | GET        | 导出状态                                        |
| /api/account/exports/:id/download                   | GET        | 成功后私有下载 DOCX                             |

question 是非空文本且长度最多 2000 个 UTF-16 单元。SSE 已实现，用来推送持久化快照，不是浏览器直接连接模型供应商。前端需使用快照版本判断新旧，不能按到达顺序直接覆盖。

## 诊断与服务间协议

浏览器通过 /api/account/telemetry/traces 和 /api/account/telemetry/errors 上报受控诊断。服务端仍做身份、大小、速率、路径和敏感字段过滤，不允许任意正文作为日志写入。/api/health 只能用于基础存活判断，不能证明所有账号依赖或真实模型已就绪；/api/metrics 用于受控采集。

Python HTTP 协议由 [识别适配器](../server/services/recognition-adapter.ts)和 [Python 服务](../services/recognition)共同定义。响应需要关联 requestId、非空受限 LaTeX 和安全的 modelVersion。额外响应字段不构成可信权限；外部传入 isMock 不决定真实模型状态。详见[模型运行手册](Docker模型服务操作手册.md)。
