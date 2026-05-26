# 01 · 总体架构

## 进程拓扑

```
┌────────────────────────────────────────────────────────┐
│  浏览器：Vue 3 + Naive UI                               │
│           ↑ HTTP / SSE                                 │
├────────────────────────────────────────────────────────┤
│  Node BFF（Fastify + zod）  —— 单进程                  │
│  ├─ 静态托管 web/dist                                  │
│  ├─ /api/*  REST                                       │
│  ├─ /api/events  SSE（前端实时面板）                    │
│  ├─ JSON 文件存储  ~/.zero-panel/                      │
│  ├─ 订阅 / 节点 / 编译器 / 计量 / 探测                  │
│  └─ 内核管家                                           │
│           ↓ IPC (~/.zero/control.sock) 或 HTTP :9090   │
├────────────────────────────────────────────────────────┤
│  Zero 内核（Rust）                                      │
└────────────────────────────────────────────────────────┘
```

## 技术栈

| 层 | 选型 | 备注 |
|---|---|---|
| 内核 | Zero (Rust) | 项目方定制内核 |
| 运行时 | Node 20 LTS+ | 后端 BFF 与前端打包 |
| 后端框架 | Fastify | 性能、插件生态 |
| 校验 | zod | TypeScript 优先的 schema |
| 前端 | Vue 3 + Vite + Pinia | 组合式 API |
| UI 库 | **Naive UI** | 暗色友好，表格/表单组件强 |
| 图表 | ECharts | 流量曲线 |
| 包管理 | pnpm + workspace | 单仓多包 |
| 进程管理 | systemd | 面板 + 内核独立 unit |
| 部署 | tar.gz + install.sh | 解压即用，可选 Docker |

## Monorepo 布局

```
zero-tools/
├── docs/                   立项与开发文档
├── packages/
│   ├── server/             Node BFF（Fastify）
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── web/                Vue 3 SPA
│   │   ├── src/
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── shared/             两端共享的 zod schema 与类型
│       ├── src/
│       └── package.json
├── scripts/                构建 / 安装脚本
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── .gitignore
├── .editorconfig
├── .prettierrc
├── eslint.config.js
└── README.md
```

## 后端模块

```
packages/server/src/
├── index.ts                启动入口
├── config.ts               读取面板自身配置（监听端口、内核路径）
├── auth/                   登录 + JWT 中间件
├── storage/
│   ├── json-store.ts       原子读写（temp + rename + lock）
│   └── paths.ts            目录布局常量
├── kernel/
│   ├── detector.ts         探测内核存在与版本
│   ├── installer.ts        从 GitHub Release 下载
│   ├── supervisor.ts       启停 / 健康检查
│   └── client.ts           IPC + HTTP 双通道客户端
├── subscription/
│   ├── fetcher.ts          带 UA、超时、缓存的拉取
│   ├── parser-clash.ts     Clash YAML 解析
│   ├── parser-v2ray.ts     base64 / 单 URI 解析
│   └── scheduler.ts        定时刷新
├── compiler/               ⭐ 内存模型 → Zero config.json
│   ├── inbound.ts
│   ├── outbound.ts
│   ├── route.ts
│   └── index.ts
├── stats/
│   ├── collector.ts        订阅事件累计
│   ├── aggregator.ts       小时/日聚合
│   └── exporter.ts         CSV / JSON 账单
├── probe/
│   ├── healthcheck.ts      节点测速
│   └── blacklist.ts        失败退避
├── api/
│   ├── subscriptions.ts
│   ├── nodes.ts
│   ├── tunnels.ts
│   ├── inbounds.ts
│   ├── routes.ts
│   ├── stats.ts
│   ├── system.ts           内核状态、配置导出、快照
│   └── events.ts           SSE
└── utils/
```

## 前端模块

```
packages/web/src/
├── main.ts
├── App.vue
├── router/
├── stores/                 Pinia
├── api/                    REST 客户端封装
├── views/
│   ├── Dashboard.vue       概览
│   ├── Subscriptions.vue   订阅 + 节点池
│   ├── Tunnels.vue         隧道组编排
│   ├── Inbounds.vue        入站端口
│   ├── Routes.vue          入站 ↔ 隧道 绑定
│   ├── Stats.vue           计量明细
│   ├── Logs.vue            事件流
│   └── Settings.vue        内核 / 备份 / 账号
├── components/
│   ├── TunnelEditor.vue
│   ├── TrafficChart.vue
│   ├── ConfigDiff.vue
│   └── KernelStatusBadge.vue
├── layouts/
└── styles/
```

## 关键交互流程

### 配置变更下发

```
UI 改动 → POST /api/<module>
        → 后端写 JSON
        → compiler.build() 产出新 zero config
        → POST /api/system/apply（含 dry-run diff 预览）
        → kernel.client.command('config.apply', config)
        → 写入 snapshots/<ts>.json
```

### 实时事件

```
内核 SSE / IPC subscribe
   ↓
stats.collector （按 inbound/tunnel 累计）
   ↓
   ├─→ 内存计数器（current.json 每分钟刷盘）
   └─→ 前端 SSE 通道（/api/events）
```

## 设计原则

1. **面板拥有 config 全部所有权**：用户不直接编辑 Zero config.json，所有变更走面板模型 → 编译器
2. **dry-run 优先**：所有下发前先 diff 预览
3. **快照可回滚**：snapshots 目录保留最近 N 份历史
4. **故障隔离**：内核挂了不影响面板查看历史和编辑配置；面板挂了不影响内核继续转发
5. **无外部依赖**：不依赖数据库、Redis、消息队列
