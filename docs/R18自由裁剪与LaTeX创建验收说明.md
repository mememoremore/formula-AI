# R18 自由裁剪与 LaTeX 创建验收说明

日期：2026-10-29。开发目录为独立克隆 `Formula-AI-R18`，分支 `feature/r18-formula-input`，基线 `2ef981ebb4b66d1946bd7844978edb6586eeeb7f`。实现提交 `d243b7d645d62bc9ecfbeaf76202d006933e241f`。

## 1. 交付范围

本轮只实现单区域图片自由裁剪与账号 LaTeX 直接创建，没有新增自动检测模型、PaddleX 流水线、批次/区域/识别结果 Model、区域任务、DETECTION 额度或批量保存。Python 服务、识别 Worker、资源租约与队列事务未修改。没有游客永久公式库、生产迁移、生产部署、真实对象清理或付费模型调用。

### 图片自由裁剪

选择/拍照 → 自动打开自由裁剪 → 确认预览 → 沿用私有上传 → 提交原识别任务。支持自由比例、移动、缩放、八方向边界调整、取消、重置及重新裁剪。重新裁剪读取独立保留的原始 File，而非上一次压缩结果。

Cropper.js 固定为 2.3.1，先在忽略目录做四视口导出与触控探针，再加入依赖；12个新增解析包均属于裁剪库依赖，没有升级原有依赖。组件仅在 onMounted 内动态导入库，SSR 不构造 DOM 裁剪实例。

EXIF 通过 createImageBitmap 的 from-image 方向设置先烘焙到无方向元数据的图像；使用库原生 precise 模式保留显示坐标的小数精度，导出时按原图像素计算大小。框选和图像变换均受边界检查，不允许缩放/移动产生图片外的裁剪。旋转/倾斜不在本轮交互范围内。

Object URL、ImageBitmap、输出及预处理 Canvas 在确认、取消、替换和销毁时释放。重新裁剪原图只保留在当前 Nuxt 实例内，服务端保存最终上传的裁剪图片。服务端仍执行 JPEG/PNG 魔数、完整解码、10MiB、20MP、单帧、EXIF及容量预留保护。

### LaTeX 直接创建

新增 `/formulas/new`，从上传页和账号公式库进入，未登录按现有 Auth Middleware 返回登录页。输入标题及源码，实时 KaTeX 预览和有界解析错误原因，校验通过后保存到账号详情。使用现有草稿离开保护，保存中限制冲突操作。

新 MANUAL 首版本在详情标为手动输入，提供原始输入而非错误的原图缺失提示。分类、收藏、版本编辑、固定版本聊天与 DOCX 均沿用旧能力。游客不会因此新增本机永久公式。

## 2. 数据库与 API

迁移：`prisma/migrations/202610290001_manual_formulas/migration.sql`。

- Formula 增加可空 `creationKey VARCHAR(100)`、`creationHash CHAR(64)`。
- 唯一索引 `(ownerId, creationKey)`；旧行均可保持 NULL。
- CHECK 保证两个字段同时为空或同时有效，非空键为 UUID、摘要为64位十六进制，且不混用 recognitionTaskId。
- 首版本允许 RECOGNITION/DEMO/MANUAL；后续版本仍只能 MANUAL。
- 未修改公式版本不可变触发器、固定上下文、账号外键或任务/额度事务。
- 整份新迁移使用 BEGIN/COMMIT，不回填、不覆盖历史公式；仅在 R1 独立数据库执行。

`POST /api/account/formulas` 接受 `{ requestKey, title, latex }`，返回既有 SavedFormula DTO。名称1～100字符，LaTeX 1～5000字符；服务端重复校验内容及 KaTeX 安全设置，禁止文档、外部资源和 HTML 扩展命令。渲染成功不代表数学正确。

| 情况                             | 结果                                        |
| -------------------------------- | ------------------------------------------- |
| 首次成功                         | 201，同一事务创建 Formula 与 MANUAL v1      |
| 同账号、同键、同归一化输入       | 200，返回同一公式的当前快照，不覆盖后续编辑 |
| 同键不同输入                     | 409                                         |
| 无效语法/长度/请求键             | 400，不写入                                 |
| 未登录/跨站/浏览器预期账号不匹配 | 401/403                                     |
| 每分钟新增成功创建超过上限       | 429；已有请求重放仍可通过                   |

旧 GET 列表、识别提交、版本追加、DTO 及旧客户端行为不变。新增可选 `x-account-id` 是浏览器请求归属防护，实际所有权始终来自认证，不能由请求体指定。

## 3. 幂等与频率控制

`FORMULA_MANUAL_CREATES_PER_MINUTE=10`，必须为正安全整数，无效值拒绝操作。计数对象为本账号最近一分钟的成功手动创建，不包含幂等重放和旧识别记录。

数据库事务先取得账号级 PostgreSQL advisory lock（独立命名空间721018），随后查找已有请求和摘要，再检查次数，创建公式、首版本及创建身份后提交。Read Committed 下锁后的查询读取已提交的最新状态；多实例同账号经过相同锁，唯一索引作最终保护。

摘要来自归一化 title/latex，不含请求键，不随后续标题编辑而变化。事务中断整体回滚；提交成功但客户端丢响应时重用原键，既不重复创建，也不消耗识别额度。API 不创建识别任务、不调用 Worker。

前端在发送前保存账号绑定的 sessionStorage 回执，内容为原请求键与原表单，自动重试关闭。超时/5xx 保留；重新加载恢复同一请求。成功或确定拒绝后清理，账号退出/切换也清理。该回执只用于本标签页恢复，不是游客公式库；损坏或存储不可用时先停止发送，提供核对和显式放弃入口。

## 4. 修改文件与职责

| 文件                                                                 | 原因                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| package.json、package-lock.json                                      | 固定 Cropper.js 2.3.1；给共享校验的 Node 执行提供与 Nuxt 同目标的 imports 映射 |
| .env.example                                                         | 说明手动创建每分钟成功写入上限                                                 |
| shared/image-crop.ts                                                 | 自由矩形、变换边界和原图输出像素计算                                           |
| shared/formula-validation.ts                                         | 共享安全渲染设置、有界错误及手动输入校验                                       |
| shared/types/manual-formula.ts                                       | 单一手动创建请求类型                                                           |
| shared/navigation.ts                                                 | 把新建页作为暂态，避免详情返回空新建页                                         |
| app/components/FormulaImageCropper.vue                               | 单区域裁剪 UI、库接入、EXIF、导出及资源生命周期                                |
| app/composables/useImageSelection.ts                                 | 原始文件与裁剪结果分离，更新现有预览                                           |
| app/plugins/upload-draft.ts                                          | 保留原始 File，随删除、提交和账号清理释放                                      |
| app/pages/upload.vue                                                 | 裁剪流程及直接输入入口，保留原提交恢复机制                                     |
| app/pages/formulas/new.vue                                           | 认证、页面组合和账号状态                                                       |
| app/components/ManualFormulaCreator.vue                              | 表单、实时预览、保存反馈及草稿保护                                             |
| app/composables/useManualFormulaCreation.ts                          | 请求协调、原键恢复、身份归属与缓存失效                                         |
| app/utils/manual-creation.ts                                         | 有界、账号隔离的会话回执解析                                                   |
| app/plugins/account-boundary.ts                                      | 退出/切换时清理手动保存回执                                                    |
| app/components/AccountLibrary.vue                                    | 手动创建入口                                                                   |
| app/components/MathFormula.vue、app/utils/formula-editor.ts          | 复用同一安全校验/渲染设置，保留既有能力                                        |
| app/pages/formulas/[id].vue、app/components/FormulaDetailContent.vue | 仅针对新 MANUAL 首版本显示来源及原始输入                                       |
| prisma/schema.prisma、新迁移文件                                     | nullable 创建身份、唯一约束及 MANUAL 首版本                                    |
| server/services/manual-formula-input.ts                              | 服务端输入校验与归一化摘要                                                     |
| server/database/manual-formulas.ts                                   | 账号锁、事务、重放与频率限制                                                   |
| server/database/formulas.ts                                          | 原事务工厂允许 MANUAL 首版本，旧路径不变                                       |
| server/api/account/formulas/index.post.ts                            | 认证、HTTP校验、201/200响应及既有DTO                                           |
| scripts/test-suite.ts                                                | 登记新增测试，不删除原测试文件                                                 |
| tests/support/test-runtime.ts                                        | 隔离测试清除宿主 FORMULA_MANUAL_ 配置，使用测试默认值                          |
| tests/manual-formula.test.ts、tests/image-crop.test.ts               | 输入、摘要、回执、导航及几何/亚像素边界单元测试                                |
| tests/manual-formula-api.test.ts                                     | 实际隔离迁移、API、并发及兼容验证                                              |
| tests/e2e/r18.spec.ts                                                | 四视口裁剪/手动创建真实业务链路                                                |
| tests/e2e/journey.spec.ts                                            | 仅新增裁剪确认一步，旧断言全部保留                                             |
| 本验收说明                                                           | 范围、接口、证据、限制与安全发布记录                                           |

## 5. 验证结果与证据

所有集成/E2E 使用 R1 独立 PostgreSQL、pg-boss、SeaweedFS、Nuxt API 和实际 Worker，仅外部模型为受控替身；不读取开发 .env。Node 24.22.0、Pandoc 3.12.1。成功仅输出摘要，原始日志在忽略的 tmp/r18 和对应 R1 私有运行目录。

| 实际检查                     | 结果                                                                |
| ---------------------------- | ------------------------------------------------------------------- |
| 初始 npm ci --ignore-scripts | 通过；未执行安装脚本                                                |
| 最终快速门禁                 | generate、源码格式、资源、类型、单元、协议及生产构建/私有扫描均通过 |
| 单元                         | 117/117，包含原106项及新增11项                                      |
| 本机协议                     | 21/21                                                               |
| 完整隔离集成                 | 212/212，原203项加新增9项，0 skipped                                |
| DOCX                         | 7/7                                                                 |
| 四视口真实E2E                | 320/390/430/1440，每视口保留旧链路和R18链路，共8个用例通过          |
| 故障专项                     | exit 0，真实Worker重启1次，cleanup=verified                         |
| 成功构建客户端私有扫描       | 151文件，覆盖新页面和裁剪分包；原检查范围未缩减                     |
| npm audit                    | 0 high/critical/moderate，保留原8 low；退出1不写成全零漏洞          |
| Git Diff、暂存Blob与凭据特征 | 通过；无运行截图/日志、真实.env或模型权重                           |

在实现提交 d243b7d 上再次执行四视口真实 E2E：320/390/430/1440px 均 exit 0，每个视口的原 R16 与新增 R18 用例均通过，清理全部 verified。包含清理的运行时间分别为103.5、88.8、90.9、90.8秒；公开SSR探针均200。记录见 tmp/r18/e2e-committed.log 与对应 tmp/r16-artifacts 的 summary.json。

最终实现提交的 quality:quick 复验全部 exit 0：generate 1.5s、format 6.1s、assets 0.2s、types 24.9s、unit 7.0s、protocols 2.6s、生产构建/私有扫描55.0s。记录见 tmp/r18/quality-committed.log。

实际执行命令：`npm ci --ignore-scripts`、`npm run quality:quick`、`npm run test:isolated`、`npm run test:documents`、`npm run test:e2e`、`npm run test:e2e:faults`、`npm audit --json`，以及本轮修改文件的 Prettier 检查、`git diff --check` 和本地暂存安全扫描。npm 脚本由指定 Node 24.22.0 运行；Pandoc 使用本机3.12.1。构建、测试日志与环境回执不进入Git。

迁移测试在隔离PG连接的私有临时表上复原旧约束并放入旧数据，然后执行同一新增迁移SQL：旧记录内容保留，MANUAL首版本从拒绝变为允许。完整迁移链另在每次全新R1数据库部署。没有把小样本临时表测试描述为生产大库在线迁移演练。

并发证据：同键6个请求只产生1个201、5个200、1条公式/1个版本；12个不同新请求竞争10个名额，10个201、2个429，满额后旧键仍200。同键异文409、丢弃响应后恢复、改名后重放不覆盖、跨账号访问与旧创建路径均通过。

浏览器证据包含：真实触控事件的拖动和双指缩放、取消不改已确认结果、从原图重新裁剪、Object URL归零和Bitmap关闭、超大/非法图片、390px下EXIF 1～8对照Sharp后的尺寸与四角颜色、未保存返回保护、POST实际成功后丢响应并刷新恢复、MANUAL来源及原始输入、识别额度为0、实际聊天和DOCX下载、退出后回执清理、游客访问跳转登录。

真实截图位于 `tmp/r18/screenshots/crop-{320,390,430,1440}.png` 与 `manual-{320,390,430,1440}.png`，均为合成测试图/测试公式，已人工查看手机和桌面样板，不把编译通过当视觉验收。

### 发现并修复的问题

- 新克隆受全局 autocrlf=true 影响，源码被检出为CRLF导致基线格式失败。逐文件核对HEAD Blob后恢复原始字节，保留原本存为CRLF的历史文档，本地设置autocrlf=false；没有批量格式化旧业务内容。
- 桌面全图裁剪的边角手柄中心落在画布外，拖动误触背景关闭。将手柄命中区域移入画布，加入位置断言；不改变公共 AppModal。
- 430px下默认整数选框组合误差略越界，确认失败。启用库原生precise，保留坐标精度，输出阶段再转换原图像素，边界校验未放宽。
- 生产SSR构建中应用工具的相对 shared 导入被保留为错误路径。统一使用 Nuxt #shared 别名，并为同目标提供 Node imports 解析，保持共享单一实现。修复后生产构建与私有扫描通过。

首轮失败日志、截图及Trace保留，没有删除断言、放宽超时或用旧构建冒充通过。

## 6. Git与安全发布

本轮没有推送、创建PR或部署。实现提交仅来自安全main的新克隆，不引入旧原始仓库历史。发布前应重新fetch main，核查祖先、文件白名单、凭据与大文件，正常推送本分支并创建新PR，复用现有基础CI及显式四视口/故障工作流；不得 force push、push --all、--mirror 或推送旧本机标签。

截图、Trace、模型和.env保持忽略，仅提交必要源码、锁文件、迁移、测试和中文说明。遗留8 low需另行兼容评估，本轮没有强制升级或添加额外框架。

应用回滚使用独立提交revert，不覆盖工作区。数据库若已存在MANUAL首版本，不能直接恢复旧的首版本CHECK，也不能为回滚删除/伪装用户记录；优先保留本次向后兼容的nullable字段和放宽约束，待单独批准后再处理数据库回滚。后续实际发布必须先评估迁移锁与执行顺序，开发/生产迁移本轮均未执行。

## 7. 已知限制

- 浏览器验证为Windows Chromium和CDP触控/视口模拟，尚未覆盖真实iPhone/Safari、Android键盘及全部浏览器版本。
- 未验证低内存手机的峰值内存，也不宣称4GB服务器承载能力；本轮未新增推理模型。
- 裁剪仅处理当前选择的一张图片、一个区域，不修改已保存原图，不增加检测、任意角度旋转或多区域能力。
- KaTeX支持与Pandoc可导出集合并不完全相同，复杂输入导出仍按既有任务失败反馈处理；预览不校验数学正确性。
- 未保存的普通表单草稿依赖离开确认；待确认请求才有账号绑定会话回执。禁止会话存储时为避免不安全重试会阻止发送。
- 手动公式写入数据库而非文件容量额度，10次/分钟不等于长期数据库容量上限；增长监控与保留策略归后续部署治理。
- 本轮没有远端CI结果，需发布审批后才能推送触发，不用本机结果冒充GitHub运行。

R18完成后停止等待评审，不进入R19、R17或部署。
