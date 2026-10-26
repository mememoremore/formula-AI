# 第11天Docker模型接入开发说明与验收记录

日期：2026-10-21。模型来自桌面 `model` 目录，配置标注为 `PP-FormulaNet_plus-L`。

## 实际完成的接入设计

Python 作为 `formula-ai` Compose 项目下的独立 `recognition` 服务，使用 `formula-ai-recognition:cpu-v1` 镜像。模型目录只读挂载，不复制进镜像，原始导出文件保持不变。

Node Worker 从私有存储读取账号上传的图片，通过真实 HTTP 适配器发送到 Python；Python 返回纯 LaTeX 与模型指纹，Worker 沿用既有事务保存公式、原始版本和任务状态。登录、额度、队列、数据库归属和文件访问继续由 Node 负责。LangChain TS/DeepSeek 继续处理解释与追问。

## 为什么使用同一Compose、独立镜像

现有 `formula-ai` 是 Compose 分组名，原来已有数据库和私有存储容器。Python 放进同一分组便于管理，但独立镜像可以固定自己的依赖、单独重启和迁移设备。Nuxt 依赖升级不必重新安装模型框架，Python 故障也不会要求把数据库和 Web 进程一起重启。

当前 Nuxt 与 Worker 仍在 Windows 本机运行，调用回环地址8001；Python 容器内为8000。没有为了模型接入同时重写整个应用的部署方式。

## 模型兼容性处理

这份导出图含 `linear_v2`，不能依据同名模型的旧示例随意选择框架版本。实际检查与试运行得到：

| 路径                                         | 实际结果                                        |
| -------------------------------------------- | ----------------------------------------------- |
| Paddle 3.0.0与3.3.0，常规加载                | 导出图算子转换失败；3.3.0未注册`linear_v2`      |
| Paddle 3.3.1，PaddleX默认推理优化            | 算子已支持，但发生参数流描述读取失败            |
| 官方CPU源的Paddle 3.4.0                      | 导出属性`epsilon`的类型不兼容，不能直接升级使用 |
| **Paddle 3.3.1，关闭图优化，保留原始图执行** | **原始权重成功加载，并输出真实识别结果**        |

因此，执行配置集中在 `paddle_runtime.py`，明确关闭 IR 图优化并将优化级别设为0。没有修改权重、重写计算图、替换朋友的模型或修改安装包源码。

前处理和解码继续复用固定版本 PaddleX 的 `UniMERNetImgDecode`、`UniMERNetTestTransform`、`LatexImageFormat`、`ToBatch`、`UniMERNetDecode`，按本地 YAML 配置使用内置词表。我们只封装组合与校验，没有重新实现官方缩放、归一化或 tokenizer 算法。升级 PaddleX 时必须重新验证这些接口。

服务只从明确的本地目录读取图、配置和参数，不进行模型自动下载或失败后的权重替换。当前模型版本为：

```text
PP-FormulaNet_plus-L@1d2a570e0a7e0a1f
```

后缀来自三份导出文件名称与内容的组合 SHA-256 前16位；换权重或配置后会变化。

## 代码文件与职责

| 文件                                            | 职责                                         |
| ----------------------------------------------- | -------------------------------------------- |
| `services/recognition/Dockerfile`               | 固定Python基础镜像、系统依赖和非root运行用户 |
| `services/recognition/requirements.txt`         | 直接依赖与兼容性版本说明                     |
| `services/recognition/requirements.lock.txt`    | 实际镜像使用的完整固定依赖列表               |
| `services/recognition/app/settings.py`          | 服务密钥、模型目录、线程及输入限制           |
| `services/recognition/app/engine.py`            | 模型文件指纹、图片解码、识别流程与LaTeX校验  |
| `services/recognition/app/paddle_runtime.py`    | Paddle CPU执行与已验证的兼容配置             |
| `services/recognition/app/formula_processor.py` | 对官方前后处理器的固定组合，不含HTTP业务     |
| `services/recognition/app/main.py`              | 服务启动、鉴权、就绪、接口与单路计算锁       |
| `services/recognition/app/body_limit.py`        | 在multipart解析前限制实际请求体大小          |
| `services/recognition/tests/test_api.py`        | 无需加载权重的接口边界测试                   |
| `server/recognition/settings.ts`                | 识别来源、地址和密钥校验                     |
| `server/recognition/factory.ts`                 | 明确选择模拟或Python适配器                   |
| `server/recognition/python-adapter.ts`          | multipart传输、有限响应读取、取消与错误转换  |
| `server/worker/start.ts`                        | 创建并注入所选识别适配器                     |
| `server/worker/recognition.ts`                  | 使用任务编号追踪请求，复用原有保存事务       |
| `scripts/setup-recognition-env.mjs`             | 检查模型目录，补齐缺失配置，不输出密钥       |
| `scripts/check-recognition.ts`                  | 直接调用真实识别并记录输出                   |
| `scripts/verify-recognition-flow.ts`            | 产品API、真实Worker与数据库保存的完整联调    |
| `tests/recognition.test.ts`                     | Node真实HTTP边界、错误、结果和取消测试       |

页面只调整过时的固定模拟描述：上传按钮、任务提示、帮助、关于、识别历史和全局预览说明。访客演示继续明确标注模拟，账号结果继续根据实际 `isMock` 展示来源。没有把密钥、Docker路径或模型依赖放进页面。

## 运行与失败处理约定

- 服务以非root用户运行，模型只读挂载，容器文件系统只读，临时目录单独提供；端口只绑定本机。
- 首轮为CPU、单进程、单路推理，容器上限为4个CPU和6GiB内存。模型在启动时加载一次，不按图片反复加载。
- 计算线程持有锁直至推理结束，HTTP取消不会提前释放锁。繁忙时返回503，由现有队列管理有限重试。
- Node只发送图片字节、模式、稳定请求编号和识别服务凭据，Python不接触业务数据库或对象存储密钥。
- Python支持JPEG/PNG、10MiB文件及2000万像素上限，并校验实际解码结果；请求体限制包含multipart开销。
- Node最多读取32KiB模型响应，要求请求编号匹配、模型版本有效、LaTeX为1～5000字符；缺失结果、代码块和整篇LaTeX文档不能保存成成功。
- HTTP客户端不自动重试；保留推理60秒与队列90秒单次执行期限。永久输入/配置错误与临时服务错误分开处理。
- `python`模式配置无效会在Worker注册时失败；运行故障不会悄悄退回模拟。默认`mock`模式仍可用于独立演示和回归。

## 已取得的实际验证

兼容性验证容器中，将合成印刷图片 `x + 1 = 2` 输入朋友的原始权重，得到 `x+1=2`，单次识别耗时8.265秒。该数字是这一样本和当时设备状态下的测量，不是批量性能承诺。

TypeScript识别适配器8项测试、Python接口7项测试、现有推理12项测试、队列24项回归已通过。Python接口测试使用可控测试引擎验证协议，真实模型可用性另由上述实际推理和完整产品链路验证，二者不能混淆。

最终Docker HTTP调用及产品链路验证结果：

| 验证                        | 实际结果                                                |
| --------------------------- | ------------------------------------------------------- |
| Docker服务                  | `recognition`、`postgres`、`storage` 均健康             |
| Node直接调用真实HTTP        | 输出 `x+1=2`，`isMock: false`，耗时6000毫秒             |
| 账号上传→队列→Python→数据库 | `COMPLETED`，首次尝试即成功，耗时5414毫秒               |
| 保存内容                    | 原始版本1份，LaTeX为`x+1=2`，模型指纹与服务一致，非模拟 |
| 刷新回读                    | 任务仍关联同一公式，验证通过                            |
| 测试数据清理                | 临时账号、队列记录及上传对象已清理，未处理已有账号数据  |
| Nuxt类型检查                | 通过                                                    |
| Nuxt生产构建                | 通过，最终构建约39.5秒                                  |
| 生产客户端私有配置检查      | 通过，包含新增的识别服务密钥，共计52项自动化检查通过    |
| 配置初始化幂等              | 重复执行不改变已有配置或密钥，验证通过                  |

证据保存在 `artifacts/recognition-live-verification.json`、`artifacts/recognition-flow-verification.json` 和 `artifacts/day11-build.log`。这些本机验收文件不纳入Git，不包含模型服务密钥或用户密码。

真实识别后观察到容器内存约1.236GiB，上限6GiB；这是一时观测，不代表所有公式的峰值。当前Worker启动提示为“识别（Python）、对话（DeepSeek）与Word导出”。

本次Nuxt构建曾受到Windows沙箱创建链接的权限限制，使用项目授权权限后构建完成；资源紧张时也曾出现内存分配失败，最终将大型构建分开执行并恢复服务，没有修改系统资源配置。

## 后续质量评测范围

目前没有用户实际手写样本与标注，不能宣称手写正确率已经验收。应补充30～50张实际图片，覆盖手写/印刷、分式、根号、矩阵、中文、长公式和失败输入，记录输出、耗时及人工修订。

两种UI模式目前使用同一套权重；没有虚构两套模型。整页版面检测、自动拆分多个公式、PDF批处理、GPU部署以及真机/WPS验收不属于本次已验证范围。

运行方式见 [Docker模型服务操作手册](Docker模型服务操作手册.md)，历史文件检查见 [Python模型检查与接入方案](Python模型检查与接入方案.md)。
