# 05 · 配置编译器

> 整个项目的"心脏"：把面板内存模型编译成 Zero 内核可吃的 `config.json`。

## 输入

```ts
type CompilerInput = {
  subscriptions: Subscription[]
  nodes: Node[]
  tunnels: Tunnel[]
  inbounds: Inbound[]
  routes: Route[]
  settings: Settings
}
```

## 输出

```ts
type ZeroConfig = {
  log?: { level: string }
  api?: {
    control: {
      enabled: true
      listen: { address: string, port: number }
      // 由面板托管时通常关闭 HTTP，只保留 IPC
    }
  }
  inbounds: ZeroInbound[]
  outbounds: ZeroOutbound[]
  route: { rules: ZeroRouteRule[], final?: string }
}
```

> 实际字段以 Zero 当前版本 `docs/control-plane-api/configuration.md` 与 `examples/v0.0.2/` 为准。
> 编译器内置版本探测，按内核版本走不同 dialect，封装在 `packages/server/src/compiler/dialects/<version>.ts`。

## 编译流程

```
build(input):
  1. validate(input)              ← zod 校验
  2. expandTunnels(input.tunnels) ← 解析嵌套 + 区域 filter
  3. produceOutbounds(...)        ← 节点 outbound + 隧道分组 outbound + 链
  4. produceInbounds(...)         ← 端口 + 协议 + TLS + transport
  5. produceRoutes(...)           ← inbound.tag → outbound.tag
  6. assemble()                   ← 顶层结构合成
  7. validateOutput()             ← 二次校验（dry-run 友好）
  8. return { config, warnings }
```

## tag 命名规范

| 实体 | tag 模板 | 示例 |
|---|---|---|
| 节点 outbound | `node-<id前8>` | `node-01H8X4P7` |
| 隧道 outbound | `tn-<slug>` | `tn-hk-pool` |
| 链式 outbound | `chain-<route_id前8>` | `chain-01H8XAA1` |
| 入站 | `inbound-<slug>` | `inbound-customerA` |
| 直连兜底 | `direct` | （内置） |
| 阻止 | `block` | （内置） |

## 节点 → Zero outbound 映射示意

> 字段名以最终对齐 Zero schema 为准；下面是规则示意。

```ts
function nodeToOutbound(n: Node): ZeroOutbound {
  switch (n.protocol) {
    case 'vless':       return { type: 'vless',       tag: tagOf(n), server: n.server, server_port: n.port, uuid: n.params.uuid, flow: n.params.flow, tls: n.params.tls, transport: n.params.transport }
    case 'vmess':       return { type: 'vmess',       tag: tagOf(n), server: n.server, server_port: n.port, uuid: n.params.uuid, security: n.params.cipher, transport: ... }
    case 'trojan':      return { type: 'trojan',      tag: tagOf(n), server: n.server, server_port: n.port, password: n.params.password, tls: ... }
    case 'shadowsocks': return { type: 'shadowsocks', tag: tagOf(n), server: n.server, server_port: n.port, method: n.params.cipher, password: n.params.password }
    case 'hysteria2':   return { type: 'hysteria2',   tag: tagOf(n), server: n.server, server_port: n.port, password: n.params.password, tls: ... }
    case 'tuic':        return { type: 'tuic',        tag: tagOf(n), ... }
    case 'socks':
    case 'http':        return { type: n.protocol,    tag: tagOf(n), server: n.server, server_port: n.port, username: n.params.user, password: n.params.pass }
  }
}
```

## 隧道 → Zero outbound 映射

| 面板 type | Zero outbound type | 备注 |
|---|---|---|
| `selector` | `selector` | 默认 outbound 由面板下发选中项 |
| `urltest` | `urltest` | 自动测速选最快 |
| `fallback` | `fallback` | 顺序故障转移 |
| `round_robin` | `selector` + 面板调度器 | Zero 若无原生 round-robin，由面板定时 `policies.select` 轮换 |
| `chain` | `chained` | 形如 `[member1, member2]` 链式串联 |

## 链式（双跳）的产出

路由 `route.landing` 不为空时：

```
chain-<route_id前8>:
  type: chained
  outbounds: [ tunnel.tag(主), landing.tag(落地) ]
```

入站直接路由到 `chain-<id>`，不再单独引用主隧道。

## 路由产出

```ts
function buildRoutes(routes: Route[]): ZeroRouteRule[] {
  return routes.filter(r => r.enabled).map(r => ({
    inbound: [tagOfInbound(r.inbound_id)],
    outbound: r.landing
      ? `chain-${shortId(r.id)}`
      : tagOfTunnel(r.tunnel_id),
  }))
}
```

未匹配兜底：默认 `final = "block"`，避免误转发。

## 区域 filter 自动同步

```
若 tunnel.region_filter.auto_sync = true：
  在 expandTunnels 阶段：
    依据 nodes.json 当前内容 + region_filter.include/exclude
    生成 tunnel.members（只读，不回写 tunnels.json）
  当订阅刷新后，下次 build 即自动重组。
```

手动 `members` 与 `region_filter` 可并存：手动列表优先附加在前，filter 结果去重附加在后。

## 校验规则

- inbound `tag` 唯一
- tunnel `members` 不形成环（DFS 检测）
- route `inbound_id` / `tunnel_id` 必须存在且 enabled
- TLS 启用时 `cert_path` / `key_path` 文件存在
- `port` 不重复（同一 listen 内）
- 节点引用必须 alive（除非用户显式忽略）

校验失败：返回 `warnings[]`（可下发但提示）或 `errors[]`（拒绝下发）。

## diff 与快照

```
preview = build(model)
prev    = readLatestSnapshot()

diff = jsonDiff(prev, preview)
返回：
{
  config: preview,
  diff: [
    { path: "/inbounds/2", op: "add", value: {...} },
    { path: "/outbounds/5/server", op: "replace", value: "..." },
    ...
  ],
  warnings,
  errors
}
```

下发成功后：

```
snapshots/<ISO-ts>.json:
{
  schema_version: 1,
  applied_at: <ts>,
  applied_by: <user>,
  source_model_hash: <sha256 of model files>,
  zero_version: "v0.0.4",
  config: <ZeroConfig>
}
```

保留策略：默认最近 50 份 + 90 天，超出按时间清理。

## 增量下发（v2 目标）

当前 MVP 走整体 `config.apply`。后续若 Zero 支持差量 patch，编译器输出 RFC6902 JSON Patch，节省断流。
