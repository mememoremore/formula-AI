# 第11天Docker模型接入实施计划

> 执行方式：在当前会话中按 executing-plans 流程逐项实施；用户已选择 Docker Python 服务并授权修改 Nuxt，无需再次选择方案。

**目标：** 将桌面 PP-FormulaNet_plus-L 导出包作为独立 Docker 服务运行，接通已有识别队列，并完成真实图片验证。

**架构：** 同一个 `formula-ai` Compose 项目管理 PostgreSQL、私有存储和 Python 识别服务；识别使用独立 `formula-ai-recognition` 镜像。Node Worker 通过 HTTP 适配器调用 Python，Python 不接触业务数据库和对象存储凭据。

**技术：** Python 3.11、PaddlePaddle CPU、PaddleOCR/PaddleX、FastAPI、Docker Compose、Nuxt/TypeScript、pg-boss。

**方案依据：** [Python模型检查与接入方案](Python模型检查与接入方案.md)，用户已选择其中 Docker 服务方案。

## 约束

- 保留桌面原始模型文件，以只读目录挂载，不将模型和密钥复制进镜像。
- 首轮采用 CPU、单进程、单路推理；真实测试后记录资源与耗时，不预先承诺识别质量。
- 明确选择 `mock` 或 `python`；真实模式异常不回退模拟。
- HTTP 客户端不额外重试，沿用队列总尝试次数和统一取消信号。
- 用户文档使用中文文件名；模块按职责拆分。
- `.env` 只补充识别配置，保留数据库、认证、存储和 DeepSeek 的既有值，不打印密钥。

## 任务一：Python服务与Docker

文件：新增 `services/recognition/{Dockerfile,requirements.txt,requirements.lock.txt,.dockerignore}`、`app/{settings.py,engine.py,paddle_runtime.py,formula_processor.py,body_limit.py,main.py}`、`tests/test_api.py`；修改 `compose.yaml`。

接口：Python 接收 multipart 字段 `image`、`mode` 和 `X-Request-Id` 请求头，返回 `requestId`、`latex`、`modelVersion`；`GET /ready` 用于模型就绪检查。

- [x] 使用可替换的识别引擎测试鉴权、非法图片、成功响应、繁忙和结果校验，测试不加载真实权重。
- [x] 实现启动时加载模型、指纹版本、图片限制、单路推理和安全错误响应。
- [x] 构建固定版本依赖的 CPU 镜像，加入现有 Compose，绑定本机端口、只读挂载模型、限制服务并发。
- [x] 启动真实容器并确认只加载挂载目录中的模型，不自动换成官方下载权重。

## 任务二：TypeScript适配器与Worker

文件：新增 `server/recognition/{settings.ts,factory.ts,python-adapter.ts}`、`tests/recognition.test.ts`、`scripts/setup-recognition-env.mjs`；修改识别接口、Worker、运行配置和 npm scripts。

接口：保留 `RecognitionAdapter.recognize(input, signal)`，输入增加可选请求编号，Worker 使用任务编号关联重试。

- [x] 用实际本机 HTTP 测试服务验证 multipart、鉴权、结果、永久/临时失败、取消和单次请求行为。
- [x] 实现配置选择、地址校验、有限响应读取、结果校验和 `InferenceFailure` 映射。
- [x] 在 Worker 注册入口显式注入适配器，更新启动来源提示；真实模式配置缺失时明确失败。
- [x] 添加识别配置初始化和启动/停止命令，保留已有非空配置及其他密钥。

## 任务三：联调、验证与交付

文件：新增 `scripts/check-recognition.ts` 和中文开发/运行记录；更新 `.env.example`、README、环境变量说明、文档导航及交接清单。

- [x] 运行 Python 接口测试、TypeScript 适配器测试、推理和队列回归、类型检查、生产构建与私有配置检查。
- [x] 使用生成的已知印刷公式样本直接调用真实模型，记录实际 LaTeX、模型指纹和耗时；不将其等同于手写评测。
- [x] 经产品账号上传、队列、识别和数据库保存完成真实联调，验证结果标记为非模拟。
- [x] 重启所需的本机 Worker，确认使用 Python 识别；记录启动方式、架构取舍、限制与未完成的评测范围。
