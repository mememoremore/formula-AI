# 单机部署实施计划

沿用用户确认的方案，在现有 main 工作区执行（用户此前明确要求不另开分支）。不自动提交或推送本轮代码。

1. Dockerfile 与 .dockerignore：Linux Node 24 多阶段构建，先生成 Prisma/Nuxt，再剪除开发依赖；Worker 复用源码与运行依赖。Pandoc 固定校验和。生产启动 node .output/server/index.mjs。
2. compose.production.yaml：独立项目，数据库/S3 命名卷，外部只读模型，受限内存、日志滚动、健康检查；初始化服务依次执行 prisma migrate deploy、queue-setup.ts、check-storage.ts。Web 仅映射127.0.0.1:13000，复用宿主Nginx。
3. deploy/nginx-location.conf：复用现有TLS入口、SSE 无缓冲、覆盖客户端 IP、隐藏 metrics。生产环境模板与生成工具：随机秘密、独立数据卷、真实模式，拒绝默认空密钥启动。
4. 现有安全边界的 Docker 适配：S3 只定向放行 storage:8333；显式代理信任解析单 IP。添加单元测试覆盖伪造、多跳和非受信任地址；运行独立单测及 typecheck。
5. 生产运行说明与 Compose 插件安装脚本：固定版本、SHA256、系统范围插件目录；不改 Engine。说明证书放置、私密环境配置、初始化、回环验收、开放端口、停止和备份。停止不删除卷。
6. 本地验收：docker compose config --quiet（不打印解析密钥）；构建 Linux 镜像；独立项目初始化/健康检查。受限识别容器加载模型并识别合成公式，记录峰值内存。验证未完成项如实保留，服务器实际运行由用户执行后再确认。
