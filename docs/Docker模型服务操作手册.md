# Docker模型服务操作手册

## 服务放在哪里

代码位于 `services/recognition/`。Docker Desktop 中仍归在 `formula-ai` 分组，与 `postgres`、`storage` 并列：

```text
formula-ai（Compose项目）
├── postgres       PostgreSQL
├── storage        私有对象存储
└── recognition    Python公式识别服务
```

`formula-ai` 是项目分组名，不是将所有服务合并运行的镜像。识别镜像为 `formula-ai-recognition:cpu-v1`；Nuxt 与 Node Worker 当前仍在 Windows 本机运行。

这样既能统一管理服务，又能单独构建、重启和排查 Python。数据库、存储与 Python 不必共享运行环境；后续 Nuxt 容器化时，继续作为同一 Compose 下的独立服务即可。

模型目录默认是项目旁边的 `../model`，即当前桌面的 `model` 文件夹。Compose 将其只读挂载到 `/models/formula`，不会复制进镜像，不会修改原始图、配置或权重。换电脑时需要另行准备相同模型目录。

## 第一次配置和启动

先确保 Docker Desktop 已启动，模型目录包含：

```text
inference.json
inference.pdiparams
inference.yml
```

在项目根目录执行：

```powershell
npm run recognition:env
```

这会检查模型文件，补充缺少的识别配置并生成随机服务密钥，不输出密钥、不覆盖已有非空配置，也不改变数据库、账号、存储和 DeepSeek 的值。

确认 `.env` 中来源是 `NUXT_RECOGNITION_PROVIDER=python`。如果原来明确设置了 `mock`，初始化脚本会保留它，需要自行改为 `python`。随后运行：

```powershell
npm run recognition:up
```

第一次需要下载系统库与 Python 依赖，耗时明显多于后续启动。命令会构建镜像、启动容器并等待模型就绪；不是启动进程后立即宣告成功。

数据库、存储和队列仍使用原来的初始化方式。Nuxt 和 Worker 分别在两个终端运行：

```powershell
npm run dev
```

```powershell
npm run worker
```

Worker 应提示 `识别（Python）`。`.env` 修改后独立 Worker 不会自动重载，需停止后重新运行；服务密钥变更后也需重新创建识别容器，使双方一致。

## 配置变量

| 变量                           | 默认值/含义                                           |
| ------------------------------ | ----------------------------------------------------- |
| `NUXT_RECOGNITION_PROVIDER`    | `mock` 或 `python`，明确选择识别来源                  |
| `NUXT_RECOGNITION_SERVICE_URL` | 本机 Worker 使用 `http://127.0.0.1:8001`              |
| `NUXT_RECOGNITION_API_KEY`     | Worker 与 Python 共用的私有服务密钥，至少24位且无空白 |
| `RECOGNITION_MODEL_PATH`       | `../model`，相对于 `compose.yaml`；可使用实际绝对路径 |
| `RECOGNITION_PORT`             | `8001`，绑定 Windows 回环地址；容器内部为8000         |
| `RECOGNITION_CPU_THREADS`      | `4`，范围1～16；容器目前最多使用4个CPU、6GiB内存      |

改端口时要同时修改服务 URL；改线程时注意容器 CPU 上限，线程更多不一定更快。服务当前是 CPU 单路推理，尚未配置 GPU 透传或 GPU 版框架。

Python 容器只收到模型路径、识别密钥和线程数，不接收数据库、对象存储、会话或 DeepSeek 凭据。

## 日常查看、验证与停止

```powershell
docker compose ps
docker compose logs --tail 80 recognition
```

就绪地址为 `http://127.0.0.1:8001/ready`，返回模型是否就绪及版本。识别接口需要服务密钥，浏览器不直接调用它。

直接识别一张本机图片：

```powershell
npm run recognition:check -- "图片的完整路径.png"
```

此命令通过 Node 真实适配器调用 Python，打印 LaTeX、模型版本和耗时，并写入 `artifacts/recognition-live-verification.json`。不会创建账号或保存产品公式。图片应是 JPEG/PNG 单公式图。

完整账号链路验收需要 Nuxt、Worker、数据库、存储和识别容器都运行：

```powershell
npm run recognition:verify
```

它生成已知印刷公式样本、创建临时账号，经产品 API 上传图片和提交任务，等待真实 Worker 保存，再核对数据库、非模拟标记及刷新回读。结束时删除自己的临时账号、队列记录与对象，不处理已有用户数据。结果保存到 `artifacts/recognition-flow-verification.json`。

```powershell
npm run test:recognition
npm run test:recognition-service
npm run recognition:down
```

前两项分别验证 TypeScript HTTP 边界和 Python 接口；它们不以固定假结果证明真实模型可用。停止命令只停止识别容器，不删除模型、数据库和存储。重新启动可运行 `npm run recognition:up`。

## 依赖与模型更新

- `requirements.txt` 描述直接依赖，`requirements.lock.txt` 固定实际构建所用的全部 Python 包版本。
- 当前兼容组合使用 PaddlePaddle 3.3.1、PaddleX 3.3.12，以及显式关闭图优化的 CPU 执行器。不要单独升级框架后直接替换当前服务。
- 更新依赖时，在隔离环境按直接依赖重新解析、验证并生成完整锁定文件，再重建镜像。模型文件不参与镜像构建缓存。
- 更换模型时，先备份或使用新的发布目录，更新模型路径并重新创建识别容器。服务启动时计算三份模型文件的组合指纹，写入识别结果的模型版本。
- 当前只接受已验证的 `PP-FormulaNet_plus-L` 处理链；新模型结构或处理配置变化时应明确适配，不能因为文件名相同就直接当成兼容版本。

## 常见问题

| 现象                           | 检查方法                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| 启动提示模型目录或文件不存在   | 检查 `RECOGNITION_MODEL_PATH` 及三份导出文件；Compose 不会自动创建空目录冒充模型   |
| 容器未健康或反复重启           | 查看识别日志，确认模型、依赖及资源；不能以端口存在代替模型就绪                     |
| Worker仍提示模拟               | 确认来源为 `python`，并重启独立 Worker                                             |
| 识别提示配置或鉴权失败         | 确认 URL 与端口、密钥一致；不要把服务密钥填成 DeepSeek API 密钥                    |
| 设备忙或暂时不可用             | 服务只接受一路计算，队列有限重试；检查是否还有上一条耗时推理                       |
| 整页、多公式或模糊手写质量不好 | 首轮接口面向单公式；应先裁剪，并用实际样本评测，不能靠增加重试解决质量问题         |
| Nuxt或Worker以后搬入容器       | URL通常改为 `http://recognition:8000`，容器内 `127.0.0.1` 指向其自身               |
| 大型构建报内存分配失败         | 分开执行 Nuxt 构建和 Python 镜像构建，先确认系统可用资源；不要同时启动多份模型实例 |

目前保留60秒识别期限和队列90秒执行期限；重试由 pg-boss 管理。HTTP 取消不会强行中断 Paddle 运算，计算线程会持有推理锁直到结束，避免重试产生并发堆积。
