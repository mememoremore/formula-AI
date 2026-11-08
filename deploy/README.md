# Formula AI：4核4GB 单机试运行

环境：Ubuntu24.04 x86_64、Docker29.1.3，已有宿主Nginx、域名及证书（公网域名访问前须确认备案与接入状态）。公网入口为 `https://www.ideal-formula.top`，根域名重定向到www。既有证书继续使用 `/etc/nginx/ssl/ideal-formula.top/fullchain.crt` 和 `private.key`，不复制进镜像或部署包。

## 包含与不包含

镜像：Web/Worker/迁移共用一个 Node24 镜像，另有 PostgreSQL17、SeaweedFS4.48、CPU识别镜像。单独复制模型三个必需文件。`manifest.json` 记录镜像ID、源码状态、文件SHA256；不包含 `.env`、私钥、备份、数据库或用户图片。

首次部署使用**独立生产数据库和命名卷**；已有部署必须保留原卷，不能重复创建空环境冒充升级。本机账号/公式不会自动出现在生产。不要导入本机开发库覆盖生产库。已有kind集群、模型原件、备份和旧站静态文件保留。

## 1. 本地构建与打包（开发机）

```sh
docker build --platform linux/amd64 -t formula-ai:production .
node deploy/build-release.mjs
```

输出在忽略的 `tmp/releases/formula-ai-时间/`。通过SFTP把整个目录上传到服务器，如 `/opt/formula-ai`。不要上传本机整个项目、`.env` 或node_modules。未完成校验的包不要上线。

## 2. 服务器准备（以下在部署目录执行）

```sh
cd /opt/formula-ai
sha256sum -c SHA256SUMS
sudo sh deploy/install-compose.sh ./docker-compose-linux-x86_64
sudo docker image load -i images.tar.gz
mkdir -p models/formula
tar -xzf models.tar.gz -C models/formula
sudo docker run --rm --network none --read-only --user 0 \
  --mount "type=bind,src=$PWD/deploy,dst=/app/deploy" \
  --entrypoint node formula-ai:production /app/deploy/create-env.mjs
sudo nano deploy/.env.production
```

也可把开发机已单独准备的 `deploy/.env.production` 通过SFTP私密上传至同一路径，再运行 `sudo chown root:root deploy/.env.production && sudo chmod 600 deploy/.env.production`；文件未包含在公共部署包中。已有配置会被生成器保留。

生成器创建600权限的新文件，已有文件不覆盖。填写 `NUXT_AI_API_KEY`、`FORMULA_SMTP_USER` 和QQ授权码 `FORMULA_SMTP_PASSWORD`，不要把值发到聊天或截图。其余随机密钥已生成。数据库密码使用生成的十六进制，若自行修改需符合URL编码要求。相对模型路径以部署根目录为基准。不要复制开发环境endpoint/数据库地址。

服务器不需要安装Node或npm，也不现场构建。若自行生成了不同镜像tag，要同步 `FORMULA_APP_IMAGE`。

## 3. 仅本机启动与验证

```sh
sudo sh deploy/start.sh
curl -fsS http://127.0.0.1:13000/api/health
sudo sh deploy/compose.sh ps
sudo docker stats --no-stream
```

启动先等待数据库与S3，再依次运行现有迁移、队列安装和存储检查，成功后才启动Web/Worker/模型。不执行seed、reset、db push或自动删除。`/api/health`目前只作为HTTP进程存活探针，其历史字段不代表实际模型状态；Worker健康检查同时检查队列快照成功，Python `/ready`确保模型加载。

Web仅绑定127.0.0.1:13000。数据库/S3/识别服务不映射主机端口；不要在安全组开放这些内部端口。重跑start可核对初始化，不会新建另一套数据库；后续有新迁移的升级须先备份并停止写入。

## 4. 替换已确认可删除的旧pzadmin站点

```sh
sudo sh deploy/install-nginx-site.sh
curl --resolve www.ideal-formula.top:443:127.0.0.1 -fsS https://www.ideal-formula.top/api/health
curl -I https://www.ideal-formula.top
```

脚本先验证旧Nginx、应用回环响应、证书域名/有效期/公私钥匹配，再备份站点文件到 `/etc/nginx/formula-backups/`，替换现有配置并 `nginx -t`，通过才reload；检查或reload失败会还原配置。根域名和HTTP统一转向www。已有证书续期方式不改变；证书距离到期不足7天时先处理续期。

脚本**不删除旧 `/var/www/pzadmin` 文件**，便于回退。浏览器确认注册验证码、登录、上传识别、对话流、Word导出全部成功后，才考虑旧资产清理。域名DNS必须指向该机器，安全组允许80/443；不要另启动占用80/443的容器代理。

若要恢复旧站：找到脚本打印的备份路径，复制回其打印前确认的原站点真实路径，执行 `sudo nginx -t && sudo systemctl reload nginx`。不要覆盖证书文件。

## 资源预算与观察

本机独立测试：2核、1792MiB、无Swap，一张合成f(x)=x+1图片耗时21.3秒，cgroup内存峰值1487MiB，结束1234MiB，无OOM。**不是云服务器性能或复杂图片峰值承诺。** 单识别并发，上传全局并发1，识别排队上限4，逻辑文件配额1GiB（不等于整个磁盘占用）。HTTP默认超时和恢复机制保持不变。

Web384MiB、Worker384MiB、Postgres192MiB、Seaweed256MiB、识别1792MiB是各自硬上限，不是预留内存；与宿主机进程叠加后余量有限。复杂推理和导出并发须在云端实测；若出现OOM先减负或把识别服务外移，不能只增加Swap宣称解决。CPU、镜像压缩包、模型副本及数据都占资源，服务器14GiB空闲需持续观察。

不部署完整Grafana/Loki/Tempo/Prometheus；保留结构化Docker日志与traceID。日志每服务最多3×10MiB。用 `sudo sh deploy/compose.sh logs --tail 100 web worker recognition` 排查，发给别人前检查是否含个人信息。孤儿图片默认report，不继承本机apply。

## 停止与备份

```sh
sudo sh deploy/compose.sh stop
sudo sh deploy/compose.sh ps -a
```

stop保留卷。**不要使用 `down -v`、`docker system prune --volumes` 或删除模型/备份。**

生产备份必须同时覆盖Postgres与Seaweed卷，单独复制数据库不能恢复图片。维护窗口内先停止Web和Worker，等Worker退出，再 `pg_dump -Fc`，停止Seaweed后归档其卷；配置环境文件另做私密备份。完成后按storage→Web/Worker顺序启动，并在独立环境试还原后才称为有效备份。当前未自动配置备份定时任务、远程备份或续期服务；上线后必须安排这些工作，磁盘上的单份数据不算备份。

## 验证与运维边界

Dockerfile 与生产 Compose 提供 Linux 镜像、固定转换工具、资源与日志限制、内网服务和健康检查；部署脚本负责配置生成、离线包、启动与 Nginx 安装。开发验证入口见 [测试指南](../docs/TESTING.md)。

服务器部署后仍需核验 HTTPS、公网连通、账号发信、真实模型、DeepSeek、私有下载、故障恢复和备份还原。基础健康探针与本地替身测试不能代替这些检查。

已知运维限制：既有诊断日志中的environment标签仍固定为local，生产排查须结合实际服务器、service和traceID；未将其当作已经区分的环境。当前没有集中接入云端日志或自动备份计划。
