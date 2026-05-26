# 02 · 数据模型

## 目录布局

```
~/.zero-panel/                  # 默认数据根目录，可通过 ZERO_PANEL_HOME 覆盖
├── settings.json               # 面板自身设置
├── kernel.json                 # 内核状态缓存
├── data/
│   ├── subscriptions.json      # 订阅源
│   ├── nodes.json              # 节点池
│   ├── tunnels.json            # 隧道组
│   └── forwards.json           # 转发规则（端口+目标+隧道链）
├── stats/
│   ├── current.json            # 当前累计（内存镜像，每分钟刷盘）
│   ├── hourly/<YYYY-MM-DD>.json
│   └── daily.json              # 最近 90 天日聚合
├── cache/
│   └── subs/<sub-id>.raw       # 订阅原文缓存
├── snapshots/
│   └── <ISO-timestamp>.json    # 历次下发的 Zero config 快照
└── certs/
    └── <domain>/{cert.pem,key.pem}
```

## 写入规则

- **原子写**：`write temp file → fsync → rename`
- **互斥锁**：使用 `proper-lockfile` 或自实现 advisory lock 避免并发
- **格式**：JSON，缩进 2 空格，UTF-8 无 BOM
- **版本字段**：每个文件顶层带 `schema_version: number`，便于未来迁移

## Schema（zod / TypeScript）

> 所有 schema 集中定义在 `packages/shared/src/schemas/*.ts`，前后端共用。

### settings.json

```ts
type Settings = {
  schema_version: 1
  panel: {
    listen: string            // 默认 "0.0.0.0:8080"
    base_url?: string         // 反代场景
    session_secret: string    // JWT signing key（首启自动生成）
    password_hash: string     // argon2id
  }
  kernel: {
    binary_path: string       // 默认 /usr/local/bin/zero
    config_path: string       // Zero 接管的 config.json 路径
    control_socket: string    // 默认 ~/.zero/control.sock
    control_http?: string     // 备选 HTTP 地址
    auth_token?: string       // 远程 HTTP 才需要
    manage_mode: 'spawn' | 'systemd' | 'external'
    systemd_unit?: string     // manage_mode=systemd 时
  }
  features: {
    auto_probe: boolean
    probe_interval_seconds: number
    auto_blacklist: boolean
    failure_threshold: number
    backoff_seconds: number
  }
}
```

### kernel.json

```ts
type KernelStatus = {
  schema_version: 1
  installed: boolean
  binary_path?: string
  version?: string
  pid?: number
  running: boolean
  last_health_check_at?: number
  last_error?: string
}
```

### subscriptions.json

```ts
type Subscription = {
  id: string                  // ulid
  name: string
  url: string
  type: 'clash' | 'v2ray' | 'singbox'
  interval_seconds: number    // 默认 1800
  user_agent?: string         // 默认 ClashForWindows/0.20.39
  enabled: boolean
  created_at: number
  updated_at: number
  last_sync_at?: number
  last_sync_ok?: boolean
  last_error?: string
  node_count?: number
}

type SubscriptionsFile = {
  schema_version: 1
  items: Subscription[]
}
```

### nodes.json

```ts
type NodeProtocol =
  | 'vless' | 'vmess' | 'trojan'
  | 'shadowsocks' | 'hysteria2'
  | 'tuic' | 'socks' | 'http'

type Node = {
  id: string
  sub_id: string              // 来源订阅
  fingerprint: string         // server:port:protocol:hash 用于去重
  raw: string                 // 原始 URI 或片段
  name: string
  region: string              // HK/JP/SG/US/...
  protocol: NodeProtocol
  server: string
  port: number
  params: Record<string, unknown>
  alive: boolean
  latency_ms?: number
  last_probe_at?: number
  banned_until?: number
  manual_disabled?: boolean
}

type NodesFile = {
  schema_version: 1
  items: Node[]
}
```

### tunnels.json

```ts
type TunnelType = 'selector' | 'urltest' | 'fallback' | 'round_robin' | 'chain'

type TunnelMember =
  | { kind: 'node', node_id: string }
  | { kind: 'tunnel', tunnel_id: string }

type Tunnel = {
  id: string
  name: string
  type: TunnelType
  members: TunnelMember[]
  policy: {
    test_url?: string                 // 默认 http://www.gstatic.com/generate_204
    test_interval_seconds?: number    // urltest
    failure_threshold?: number        // fallback / round_robin
    backoff_seconds?: number
    max_concurrent?: number           // 上游保护
    sticky_seconds?: number           // round_robin 粘连时间
  }
  region_filter?: {
    include?: string[]                // 区域白名单
    exclude?: string[]
    auto_sync: boolean                // 节点池变化时按筛选条件自动重组
  }
  created_at: number
  updated_at: number
}

type TunnelsFile = {
  schema_version: 1
  items: Tunnel[]
}
```

### forwards.json

```ts
type ForwardListenProtocol = 'mixed' | 'socks' | 'http'

type ForwardDestination = {
  address: string
  port: number
}

type Forward = {
  id: string
  name: string                     // 业务名（如 "客户A-HK中转"）
  listen: string                   // 默认 "0.0.0.0"
  port: number                     // 本地入口端口
  listen_protocol: ForwardListenProtocol  // 默认 mixed，无认证
  destination?: ForwardDestination // 可选固定目标；省略则由客户端决定
  tunnel_chain: string[]           // tunnel_id 有序列表，形成链式代理
  enabled: boolean
  created_at: number
  updated_at: number
}

type ForwardsFile = {
  schema_version: 1
  items: Forward[]
}
```

> **设计说明**：`listen_protocol` 目前仅 `mixed/socks/http`，均无认证。
> 当 Zero 内核支持 `direct`/`dokodemo-door` 入站后，将新增该选项以实现真正的 L4 透传。
> `tunnel_chain` 长度 = 1 时为单跳隧道，>1 时为链式代理（relay → landing → ...）。
> `destination` 省略时，Zero mixed 入站由客户端 SOCKS5/HTTP 握手决定目标地址。

### stats/current.json

```ts
type InboundCounter = {
  bytes_up: number              // 客户 → 出墙
  bytes_down: number            // 出墙 → 客户
  active_conns: number
  total_conns: number
}

type TunnelCounter = {
  bytes_up: number
  bytes_down: number
  selected_member?: string
  health_score: number          // 0-100
  active_conns: number
}

type CurrentStats = {
  schema_version: 1
  updated_at: number
  inbounds: Record<string, InboundCounter>
  tunnels: Record<string, TunnelCounter>
}
```

### stats/hourly/&lt;date&gt;.json

```ts
type HourlyBucket = {
  hour: number                  // 0..23
  inbounds: Record<string, InboundCounter>
  tunnels: Record<string, TunnelCounter>
}

type HourlyFile = {
  schema_version: 1
  date: string                  // YYYY-MM-DD
  buckets: HourlyBucket[]
}
```

### stats/daily.json

```ts
type DailyBucket = {
  date: string
  inbounds: Record<string, InboundCounter>
  tunnels: Record<string, TunnelCounter>
}

type DailyFile = {
  schema_version: 1
  retention_days: number        // 默认 90
  items: DailyBucket[]
}
```

## ID 规则

- 所有实体使用 **ULID**（26 字符，按时间排序）
- `tag` 字段（inbound/tunnel）使用人类可读 slug，必须全局唯一
- `fingerprint`（节点）= `sha1(protocol|server|port|core_auth_field)` 前 16 字节 hex

## 区域识别策略

```
1. 节点名正则提取：🇭🇰|HK|香港|Hong Kong → "HK"
2. 失败时回退：MaxMind GeoLite2 country code（基于 server IP）
3. 仍失败：标记为 "UNKNOWN"
```

正则映射表内置常见 60+ 区域，可在 settings 里自定义补充。
