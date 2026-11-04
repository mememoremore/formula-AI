# 2026-11-03 单机部署验收

## 已完成

- 确认服务器Ubuntu24.04/x86_64、Docker29.1.3/API1.52、4核/3.6GiB，停止kind后available2.9GiB，磁盘可用14GiB。
- 已核对用户提供的pzadmin Nginx配置与证书路径；用户明确允许替换旧站。尚未实际修改服务器。
- Linux amd64生产镜像构建成功。修复了首次容器迁移暴露的Prisma构建/运行OpenSSL版本不一致问题，复测成功。
- 独立项目`formula-prod-smoke-20261103`全新Postgres/Seaweed：14个既有migration、队列安装、签名HeadBucket成功。五个业务容器均healthy。
- 实际生产镜像：安全Cookie登录、跨Origin写入拒绝、手动保存公式、独立Worker调用Pandoc生成原生OMML Word、S3存储和账号私有下载成功；匿名下载401。未发邮件、未调用DeepSeek。
- 临时Nginx+自签证书，以真实Host/SNI重跑上述流程成功，Nginx配置语法通过。首次测试因客户端未正确选择虚拟主机而收到308，改为明确域名Host/SNI后通过，不把这个测试客户端问题当作产品缺陷。
- 故障注入Nginx配置校验失败：脚本恢复原站点文件、保留唯一备份且不reload。该测试在一次性Linux容器内进行；服务器systemd reload仍待实测。
- 2核/1792MiB/无Swap识别容器：合成f(x)=x+1识别成功，21307ms；cgroup峰值1487MiB，结束1234MiB，无OOM。不是云端吞吐或复杂样本准确率证明。
- 生产栈空闲Docker stats：Web约98MiB、Worker157MiB、Postgres47MiB、S3约34MiB、模型约1003MiB；此口径不包含全部cgroup页缓存，不与峰值直接等同。
- `npm run typecheck`成功，`npm run test:unit`151/151，源码格式检查通过。新增边界单测涵盖不信任转发头、多IP拒绝、定向S3 HTTP许可。
- 生产镜像公开产物不含本机私密配置，镜像无根.env。Linux shell语法和部署Node脚本语法通过。
- 试验容器仅按专用标签停止，未删除卷。原有开发服务、备份与模型原件不受影响。
- 离线包包含四个Linux镜像、三份只读模型副本、已验证SHA256的Compose5.7.0插件和白名单部署配置。私密生产配置另放`deploy/.env.production`，使用全新数据/会话/S3/模型凭据，复用已有AI/SMTP设置，不进入部署包或Git。

## 文件与原因

| 文件 | 用途 |
| --- | --- |
| Dockerfile、.dockerignore | Linux生产构建、固定Pandoc、依赖裁剪、排除凭据/模型/备份 |
| compose.production.yaml | 独立业务栈、数据卷、回环端口、真实提供方、资源限制与健康检查 |
| deploy/production.env.example、create-env.mjs | 明确环境变量，幂等生成新的私有配置，不覆盖已有设置 |
| deploy/install-compose.sh | 校验固定官方二进制，仅补插件，不替换Engine |
| deploy/compose.sh、start.sh | 固定生产项目和配置，先迁移/队列/存储检查再启动业务 |
| deploy/nginx-location.conf、nginx-site.conf | 复用现有宿主TLS与证书，SSE不缓冲、覆盖IP头、www规范域名 |
| deploy/install-nginx-site.sh | 应用/证书预检查、原站唯一备份、验证后reload、失败回退 |
| deploy/build-release.mjs | 白名单离线包、Linux平台检查、插件校验、流式导出及SHA256清单 |
| deploy/README.md、README.md | 上传、启动、切换、停止、备份要求及限制 |
| package.json、package-lock.json | 既有Prisma/tsx从开发依赖移至运行依赖，供迁移和Worker使用，未新增第三方库 |
| server/auth/client-ip.ts、server/api/auth/[...all].ts | 只在显式信任代理时使用有效单IP，保留直连安全默认 |
| server/storage/object-store.ts | 显式允许固定Docker S3内网地址，其他远程HTTP仍拒绝 |
| tests/deployment-boundaries.test.ts、scripts/test-suite.ts | 把新增网络边界回归纳入现有单元测试 |
| 同日期spec与plan | 记录已确认方案、实施顺序与实际服务器条件 |

## 未验证与运维限制

服务器实际加载、DNS解析、证书链浏览器信任、systemd reload、真实QQ发信/DeepSeek/SSE、复杂样本峰值与同时导出负载仍待上传后验收。没有改数据库Schema或本机数据。已有日志environment仍为local，集中生产采集、证书自动续期方式核验、定时异机备份和恢复演练还需继续安排；没有承诺4GB支撑高并发。镜像含现有迁移工具与Nuxt依赖，体积仍可优化。本轮没有提交Git或声称远端CI通过。
