# Zero Relay Panel

> 基于 [Zero](https://github.com/zerodenet/zero) 内核的透明中转网关编排面板，用订阅节点池替代 IEPL 专线。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

---

## 项目简介

Zero Relay Panel 是一个面向中转运营场景的轻量面板，将代理协议订阅节点编排成隧道，对外提供无认证的 L4 入口端口（mixed / SOCKS5 / HTTP），实现"一个端口对应一组境外隧道"的透明转发。

```
客户端 ──→ 国内入口（本面板 + Zero 内核）──隧道──→ 境外节点 ──→ 互联网
                    ↑
             订阅节点池自动同步、测速、分组
```

### 核心特性

- **订阅驱动**：导入 Clash / V2Ray 订阅链接，自动解析节点、识别地区、同步更新
- **隧道编排**：将节点组织为 selector / urltest / fallback / chain 隧道组，支持链式代理（中转 → 落地）
- **转发规则**：每条规则 = 本地端口 + 监听协议 + 隧道链，匹配 gost / 极光面板心智模型
- **配置编译**：面板模型 → Zero config.json，一键预览 / 应用 / 回滚，支持快照管理
- **流量计量**：按转发规则和隧道统计双向流量、活跃连接
- **零外部依赖**：无需数据库 / Redis / 消息队列，JSON 文件存储，单 Node 进程
- **暗色 UI**：Vue 3 + Naive UI，响应式侧栏导航

### 不做的事

- 不做用户系统、订阅链接分发、客户端导入
- 不做域名 / IP 分流规则集
- 不做 TUN / 系统代理 / GUI 客户端
- 不做入口协议层认证（mixed 入站无 user/pass）

---

## 关于 Zero 内核

[Zero](https://github.com/zerodenet/zero) 是由 [zerodenet](https://zerodenet.org) 开发的 Rust 代理内核，定位于高性能、可编程的流量转发引擎。本面板通过 Zero 的控制面与其交互。

### 内核能力

| 协议 | 入站 | 出站 | 备注 |
|---|:---:|:---:|---|
| Mixed (SOCKS5+HTTP) | ✅ | — | 面板默认入口 |
| SOCKS5 | ✅ | ✅ | |
| HTTP CONNECT | ✅ | ✅ | |
| VLESS | — | ✅ | 支持 XTLS Vision / Reality |
| VMess | — | ✅ | |
| Trojan | — | ✅ | |
| Shadowsocks | — | ✅ | |
| Hysteria2 | — | ✅ | |
| TUIC | — | ✅ | |

### 控制面通信

面板通过两种通道与 Zero 内核交互（优先 IPC，HTTP 备选）：

```
面板 (Node BFF)
   ↕  IPC: ~/.zero/control.sock（Unix Socket，JSON-line 协议）
   ↕  HTTP: 127.0.0.1:9090（REST + SSE）
Zero 内核 (Rust)
```

关键控制面操作：

| 面板动作 | 内核命令 |
|---|---|
| 下发配置 | `config.apply` |
| 切换 selector 节点 | `policies.select` |
| 触发节点探测 | `policies.probe` |
| 关闭活跃连接 | `flows.close` |
| 拉取运行时信息 | `query('Runtime')` |
| 拉取策略组 | `query('Policies')` |

### 内核生命周期

面板支持三种内核管理模式：

| 模式 | 说明 | 适用 |
|---|---|---|
| `spawn` | 面板 fork 内核子进程 | 单机简单部署 |
| `systemd` | 调用 `systemctl` 管理 | 生产推荐 |
| `external` | 仅通信，不管理生命周期 | 内核由外部工具管理 |

### 安装 Zero 内核

Zero 内核需要单独安装，面板不内置。获取方式：

```bash
# 从 GitHub Release 下载（推荐）
# https://github.com/zerodenet/zero/releases

# 解压后放入 PATH 或在面板设置中指定路径
mv zero /usr/local/bin/
chmod +x /usr/local/bin/zero
```

安装后在面板「设置 → 内核状态」中确认内核已安装并运行。

---

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 9
- Zero 内核（可选，面板可独立运行于 API-only 模式）

### 安装与启动

```bash
# 克隆仓库
git clone git@github.com:zerodenet/relay.git
cd relay

# 安装依赖
pnpm install

# 构建
pnpm build

# 启动（生产模式）
NODE_ENV=production pnpm start

# 或开发模式（热重载）
pnpm dev
```

首次启动时，面板会在 stderr 输出初始管理员密码，请登录后立即修改。

### 访问面板

浏览器打开 `http://<服务器IP>:8080`，使用初始密码登录。

### 基本使用流程

1. **添加订阅**：在「订阅」页面填入 Clash / V2Ray 订阅链接，点击同步
2. **创建隧道**：在「隧道」页面将节点组织为隧道组（selector / urltest / chain 等）
3. **添加转发**：在「转发」页面创建规则，指定本地端口 + 隧道链
4. **应用配置**：在「设置 → 配置管理」点击「应用并下发」，编译并推送到 Zero 内核
5. **验证**：客户端通过 `socks5://服务器IP:端口` 连接测试

---

## 仓库结构

```
zero-tools/
├── docs/                    设计与开发文档
├── packages/
│   ├── shared/              前后端共享 zod schema 与类型
│   ├── server/              Node BFF（Fastify）
│   └── web/                 Vue 3 SPA
├── LICENSE
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## 数据存储

所有数据存储在 `~/.zero-panel/`（可通过 `ZERO_PANEL_HOME` 环境变量覆盖）：

```
~/.zero-panel/
├── settings.json            面板设置（密码哈希、内核路径等）
├── data/
│   ├── subscriptions.json   订阅源
│   ├── nodes.json           节点池
│   ├── tunnels.json         隧道组
│   └── forwards.json        转发规则
├── snapshots/               配置快照（自动保留最近 50 份）
├── stats/
│   └── current.json         实时流量统计
└── cache/                   订阅缓存
```

## 技术栈

| 层 | 选型 |
|---|---|
| 内核 | [Zero](https://github.com/zerodenet/zero) (Rust) |
| 运行时 | Node.js 20 LTS+ |
| 后端 | Fastify + zod + argon2 |
| 前端 | Vue 3 + Vite + Pinia + Naive UI |
| 存储 | JSON 文件（原子写入 + 文件锁） |
| 包管理 | pnpm workspace |

## 文档导航

| 文档 | 内容 |
|---|---|
| [产品概览](./docs/00-overview.md) | 定位与场景 |
| [总体架构](./docs/01-architecture.md) | 进程拓扑与技术栈 |
| [数据模型](./docs/02-data-model.md) | JSON schema |
| [REST API](./docs/03-api.md) | 接口规范 |
| [内核对接](./docs/04-kernel-integration.md) | Zero 控制面通信 |
| [配置编译器](./docs/05-config-compiler.md) | 内存模型 → Zero config |
| [订阅与节点](./docs/06-subscription.md) | 订阅解析 / 节点池 |
| [计量与统计](./docs/07-stats.md) | 流量聚合 |
| [前端规划](./docs/08-frontend.md) | UI 设计 |
| [部署运维](./docs/09-deployment.md) | systemd / 备份 |
| [路线图](./docs/10-roadmap.md) | 版本规划 |

## License

[MIT](./LICENSE) &copy; [zerodenet](https://zerodenet.org)
