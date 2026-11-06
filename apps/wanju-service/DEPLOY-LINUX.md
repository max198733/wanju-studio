# 玩剧后台：轻量云服务器部署

这是 Linux 云主机部署方案，不依赖 Railway。当前 `wanju.kukukaka.cn` 已在
2026-10-30 更新至 0.1.11，使用统一账号、云项目持久卷和每日备份。
下列命令主要面向新主机；已有主机更新必须保留原 `.env`、数据卷与加密材料。
实际交付与回滚说明见工程 `docs/wanju/发布与运维.md`。

## 给老师看的部分

你只需要先确定自己的云账户、地区和预算。小规模内测建议从 2核2GB 内存、40GB 系统盘、Linux 系统和公网带宽开始，这不是已压测的学员容量保证。此后台不承担视频渲染，不需要购买显卡实例。

中国内地节点面向学员使用时，按云厂商要求办理网站/APP相应备案。中国香港节点可作为另一种部署选择，但要先从学员网络实测访问质量。不要为了便宜直接买没有确认过地域、续费价格与购买资格的多年套餐。

老师无需自己敲下面的开发命令。云主机开通后，可以由开发人员或编程工具按本文件部署。云账号密码、支付信息和完整供应商密钥不要粘贴到普通聊天里。

## 给实施人员看的部分

### 1. 准备主机

建议使用 Ubuntu 24.04 LTS x64。先确认云主机可出网访问所选供应商接口、Node 基础镜像与 Caddy 镜像仓库，不把下载不通误判成应用错误。安装 Docker Engine 与 Docker Compose 插件，按 Docker 对该发行版的官方安装文档操作。

采用 SSH 密钥访问，将 SSH 入站限定到运维者地址；对公网开放 TCP 80 和 443。不要向公网开放 4890，后台通过 Caddy 的 HTTPS 入口访问。

准备一个实际控制的域名或子域名，将 A 记录指向云主机公网 IPv4。只有配置真实域名、DNS正确、80/443 可达后，Caddy 才能自动申请并续期公开可信证书。国内节点先完成云厂商要求的备案接入。

### 2. 上传单独的部署目录

只上传桌面 `wanju/老师后台部署包` 中的文件至服务器 `/opt/wanju-students`。不要上传完整原工程、供应商私有配置、原测试账本或卡密表。

上传文件应包括 `Dockerfile`、`compose.yaml`、`Caddyfile`、`.env.example`、程序文件及 `public/`。不需要在云端上传 Electron 安装包。

### 3. 创建私密环境文件

在部署目录执行：

```sh
cd /opt/wanju-students
umask 077
cp .env.example .env
chmod 600 .env
```

使用编辑器填写真实域名，并为 `WANJU_ADMIN_SECRET` 填入至少 32 字符的强随机加密与维护密钥。已有服务必须保留原值。后台日常登录密码单独设置；桌面复制口令脚本读取已保存的登录密码，不生成加密密钥。

为 `WANJU_PROXY_TOKEN` 配置另一个至少 32 字符的随机令牌。Compose 将它提供给 Caddy 和账户服务；Caddy 覆盖客户端来源头，账户服务仅在私有令牌匹配时使用该来源进行限流，防止不同用户共用代理计数。令牌不发给浏览器、学员或安装包。直接运行本机服务可以不配置此令牌，此时来源头不被信任。

`.env` 不进入镜像和源码仓库。将该文件与数据备份分开加密保管，但恢复时必须找回同一口令。不要随意更换已使用口令，否则不能解密原供应商配置。

### 4. 构建并启动

```sh
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:4890/health
```

Compose 会启动账户服务与 Caddy 两个容器；SQLite 保存于独立持久卷，证书数据也使用持久卷。外网仅通过 80/443 访问 Caddy。创建、更新容器不会主动清空钱包卷；不要执行 `docker compose down -v`。

浏览器使用真实 HTTPS 域名访问 `/health` 和 `/admin`。管理口令只输入 HTTPS 后台，不在 HTTP 裸IP地址里登录。

### 5. 验收

1. 确认公网 `/health` 为目标版本、HTTPS 正常，后台可登录。
2. `/api/public` 应返回 `unified_account`、云服务可用、服务费默认关闭。
3. 创建专用账号验证无激活码注册、真实文件上传/下载、跨账号不可读与原生工程可打开。
4. 后台配置多个媒体模板，按账号分配测试子密钥，验证只本人可获取且后台摘要不回显。
5. 未授权不做收费模型测试；实际生成质量、速度及计费另行约定预算。
6. 核对下载包大小、SHA-256、版本和教程，再同步更新公开下载清单。

本地创作无需登录；云默认媒体需要管理员按账号分配子密钥。自有配置可自行填写。
平台服务费当前在手动云同步时去重核算，默认关闭，没有即时强制扣费或自动支付。

### 6. 备份和恢复

当前主机已使用 `ops/backup.mjs` 和 `ops/backup.sh` 在线一致性备份 SQLite、
已提交文件对象、私有环境及服务源文件，校验后保留约 14 天。定时器每日北京时间 03:30
后五分钟内执行。无需停止服务；空间不足会报错而非先删除旧备份。

```sh
sudo systemctl status wanju-backup.timer
sudo systemctl start wanju-backup.service
sudo journalctl -u wanju-backup.service -n 30 --no-pager
```

新主机需安装对应 systemd 文件并确认实际路径、卷名和权限。本轮已有隔离恢复验证与独立本机副本，
日常定时任务仍在服务器本机，正式运营还需异地自动备份。恢复要保留原加密材料并先在隔离目录验证，
不能直接用旧库覆盖新业务数据。

## 验证范围

本机没有 Docker 运行环境时，可以验证源代码、复制完整性与 SQLite 持久化，但不等于已验证 Linux 容器和公网 HTTPS。只有在实际云主机上成功启动并完成上述验收，才可宣称上云完成。

## 官方参考

Docker Ubuntu 安装：

`https://docs.docker.com/engine/install/ubuntu/`

Caddy HTTPS：

`https://caddyserver.com/docs/automatic-https`

阿里云备案与服务器要求：

`https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-server-access-information-check`
