# 09 · 部署运维

## 系统要求

- Linux x86_64 / aarch64
- 内核：Linux 4.x+（IPC 用 Unix Domain Socket）
- glibc 2.28+（兼容 Debian 10+ / Ubuntu 20.04+ / RHEL 8+）
- Node.js 20 LTS+（仅生产部署，开发可用更新版）
- 1 vCPU / 512MB RAM / 2GB 磁盘 起

## 目录约定

```
/opt/zero-panel/                    # 程序目录
  ├─ server/                        # Node BFF 编译产物
  │   └─ dist/index.js
  ├─ web/                           # 前端 dist
  ├─ node_modules/                  # 生产依赖
  └─ install.sh

/usr/local/bin/zero                 # Zero 内核二进制
/etc/zero/                          # Zero 内核 config
  └─ config.json                    # 由面板托管

/var/lib/zero-panel/                # 数据目录（= ~/.zero-panel/）
/var/log/zero-panel/                # 日志（systemd journal 优先，文件备用）

/etc/systemd/system/zero.service
/etc/systemd/system/zero-panel.service
```

通过环境变量可改：

```
ZERO_PANEL_HOME       默认 /var/lib/zero-panel
ZERO_PANEL_LISTEN     默认 0.0.0.0:8080
ZERO_BINARY           默认 /usr/local/bin/zero
ZERO_CONFIG           默认 /etc/zero/config.json
ZERO_CONTROL_SOCK     默认 ~/.zero/control.sock
```

## 安装方式

### 方式 1：一键脚本（推荐）

```bash
curl -fsSL https://example.com/install.sh | bash
```

脚本行为：

1. 检测系统 / 架构
2. 创建 `zero-panel` 用户与目录
3. 下载面板 release（tar.gz）解压到 `/opt/zero-panel`
4. 引导安装 Zero 内核（首次启动后通过面板 UI 也可装）
5. 写入 systemd unit
6. 启动并打印访问地址 / 初始登录凭据（仅首次显示）

### 方式 2：手动

```bash
useradd -r -s /usr/sbin/nologin zero-panel
mkdir -p /opt/zero-panel /var/lib/zero-panel
chown -R zero-panel: /opt/zero-panel /var/lib/zero-panel
tar -xzf zero-panel-<version>-linux-<arch>.tar.gz -C /opt/zero-panel --strip-components=1
cp /opt/zero-panel/install/zero-panel.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now zero-panel
```

### 方式 3：Docker（可选，v1.1+）

```yaml
services:
  zero-panel:
    image: ghcr.io/<org>/zero-panel:latest
    network_mode: host        # 必要：内核需要直接访问网络
    volumes:
      - /var/lib/zero-panel:/data
      - /etc/zero:/etc/zero
      - /usr/local/bin/zero:/usr/local/bin/zero:ro
    environment:
      ZERO_PANEL_HOME: /data
      ZERO_PANEL_LISTEN: 0.0.0.0:8080
    restart: unless-stopped
```

容器内不再 spawn 内核，需 `manage_mode=external` 或在宿主用 systemd 管。

## systemd 单元

`/etc/systemd/system/zero-panel.service`：

```ini
[Unit]
Description=Zero Relay Panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=zero-panel
Group=zero-panel
WorkingDirectory=/opt/zero-panel
Environment=NODE_ENV=production
Environment=ZERO_PANEL_HOME=/var/lib/zero-panel
ExecStart=/usr/bin/node /opt/zero-panel/server/dist/index.js
Restart=on-failure
RestartSec=5s
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/zero.service`：

```ini
[Unit]
Description=Zero Proxy Kernel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=zero-panel
Group=zero-panel
ExecStart=/usr/local/bin/zero run --status-listen 127.0.0.1:9090 /etc/zero/config.json
Restart=on-failure
RestartSec=3s
LimitNOFILE=1048576
AmbientCapabilities=CAP_NET_BIND_SERVICE CAP_NET_ADMIN
CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_NET_ADMIN

[Install]
WantedBy=multi-user.target
```

## 反向代理（推荐）

```nginx
server {
  listen 443 ssl http2;
  server_name panel.example.com;

  ssl_certificate     /etc/letsencrypt/live/panel.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/panel.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE 长连接
    proxy_buffering off;
    proxy_read_timeout 1h;
  }
}
```

面板 `settings.panel.listen` 改为 `127.0.0.1:8080`，仅经反代访问。

## 防火墙

```
对外暴露端口：
  - 443/tcp（面板，经 nginx）
  - inbounds 配置的端口（业务）

仅本地端口：
  - 127.0.0.1:8080（面板原始端口，nginx 后端）
  - 127.0.0.1:9090（Zero 控制面 HTTP）
  - ~/.zero/control.sock（IPC，文件权限隔离）
```

## 备份与恢复

```bash
# 备份
tar -czf zero-panel-backup-$(date +%F).tgz \
  -C /var/lib/zero-panel . \
  -C /etc/zero config.json

# 恢复
systemctl stop zero zero-panel
tar -xzf zero-panel-backup-XXX.tgz -C /var/lib/zero-panel
systemctl start zero-panel
# 面板启动后会拉起内核
```

面板 UI 内 `/api/system/export` 与 `/api/system/import` 可在线完成同等操作。

## 升级

```bash
systemctl stop zero-panel
tar -xzf zero-panel-<new-version>-linux-<arch>.tar.gz -C /opt/zero-panel --strip-components=1
systemctl start zero-panel
```

数据目录与 schema 保持向后兼容；如需迁移：启动时检测 `schema_version` 并执行 `packages/server/src/storage/migrations/*.ts`。

## 监控

- 健康检查：`GET /api/system/info` 返回 200 即视为存活
- 内核监控：`GET /api/system/kernel`（含 `running`、`version`）
- Prometheus（v1.1+）：`/metrics` 暴露入站/隧道流量计数器

## 日志

- 默认输出到 stderr（systemd journal 自动接管）
- 级别：`error / warn / info / debug`，由 `settings.features.log_level` 控制
- 关键审计：登录、配置下发、快照回滚 单独写 `audit.log`
- 日志轮转：journalctl 内置；文件模式由 `logrotate` 管理（安装脚本配置）

## 故障排查清单

| 现象 | 检查 |
|---|---|
| 面板打不开 | `systemctl status zero-panel` + `journalctl -u zero-panel -n 200` |
| 内核管理"未运行" | `systemctl status zero` + `ls -l ~/.zero/control.sock` |
| 配置下发失败 | `journalctl -u zero -n 200` + `/api/system/snapshots` 最新 `apply_failed` |
| 流量统计为 0 | 内核控制面是否启用、SSE 通路是否建立、`flow.completed` 事件订阅 |
| 节点全部红 | 探测目标 URL 是否被屏蔽、并发限制、UA 是否触发风控 |
