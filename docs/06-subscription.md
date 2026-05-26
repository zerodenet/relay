# 06 · 订阅与节点

## 订阅来源

支持的格式：

| 类型 | 识别方式 | 解析器 |
|---|---|---|
| Clash / Clash Meta | YAML 顶层含 `proxies:` 数组 | `parser-clash.ts` |
| V2Ray base64 订阅 | base64 解码后多行 URI | `parser-v2ray.ts` |
| 单 URI 列表 | 文本，每行一条 `vless://...` 等 | `parser-v2ray.ts` |
| sing-box | JSON 顶层含 `outbounds:` | `parser-singbox.ts` |

## 拉取流程

```
fetcher.ts:
  1. 构造 fetch：
     - User-Agent: 默认 "ClashforWindows/0.20.39"，可配
     - Accept: */*
     - 超时 30s
     - HTTP/2 优先
  2. 命中订阅自身 HTTP 头 `subscription-userinfo` → 解析 expire/total/upload/download
  3. 写缓存 cache/subs/<sub-id>.raw（断网容灾）
  4. 嗅探格式 → 调对应 parser → Node[]
  5. diff 与 nodes.json 合并：
     - 同 fingerprint 视作同节点 → 保留 id / 探测历史
     - 来源订阅消失的节点 → 标记 dropped 或直接清理
  6. 写 nodes.json（原子）
  7. 触发：tunnels 自动同步 + 编译器 dirty
```

## 节点 fingerprint

```ts
fingerprint = sha1(
  [protocol, server, port, primaryAuthField(node)].join('|')
).slice(0, 32)
```

`primaryAuthField` 按协议：

| 协议 | 字段 |
|---|---|
| vless / vmess / tuic | uuid |
| trojan / hysteria2 | password |
| shadowsocks | method + ':' + password |
| socks / http | user/pass 或空 |

## 区域识别

按顺序尝试，命中即停：

1. **节点名正则**：内置约 60 条规则（`/(🇭🇰|HK|香港|港|HongKong)/i` → `HK`）
2. **GeoIP**：嵌入 MaxMind GeoLite2 country 数据（约 7MB），按 `server` IP 解析
3. **DNS A/AAAA**：domain → IP → GeoIP
4. 失败：`UNKNOWN`

正则表存于 `packages/server/src/subscription/regions.ts`，支持用户在 `settings.json` 内补充覆盖。

## 节点去重与冲突

- 同 fingerprint：视为同节点，**保留旧 id 与探测数据**，更新 raw / name / region / params
- 同 server:port 但 fingerprint 不同：视为不同节点（auth 变了即新节点）
- 跨订阅同节点：以最新拉取为准，但 `sub_id` 仍指向首次发现订阅

## 节点测速（probe）

`probe/healthcheck.ts`：

```
对每个节点：
  1. 通过内核临时 outbound 或独立 TCP/UDP 连接探测
  2. HTTP HEAD 到 settings.features.probe_url（默认 http://www.gstatic.com/generate_204）
  3. 记录：latency_ms / alive / last_probe_at
  4. 失败 ≥ failure_threshold 次 → banned_until = now + backoff_seconds
```

调度：

| 触发 | 范围 |
|---|---|
| 定时（默认 5min） | 所有 alive=true 与 banned 已过期的节点 |
| 订阅刷新后 | 该订阅新增/变更的节点 |
| 手动按钮 | 单节点 / 单隧道组 / 全量 |

## 黑名单与退避

`probe/blacklist.ts`：

```
state per node:
  consecutive_failures: number
  banned_until: number

failure:
  consecutive_failures++
  if consecutive_failures >= threshold:
    banned_until = now + backoff
    consecutive_failures = 0
    backoff = min(backoff * 2, max_backoff)

success:
  reset
```

`max_backoff` 默认 30 分钟。

## 与隧道的联动

启用 `tunnel.region_filter.auto_sync` 后：

```
节点池变化（订阅刷新 / 节点禁用 / 黑名单生效）
  ↓
tunnel.expand 阶段重新计算 members
  ↓
config.apply 触发（防抖：5s 内合并多次）
```

未启用 `auto_sync`（手动模式）：仅展示提示"成员节点已变化"，由用户决定是否重组。

## UA 与防风控

- 默认 UA：`ClashforWindows/0.20.39`
- 拉取间隔 jitter：在 `interval_seconds` ±10% 之间随机
- 单订阅源最小间隔：5 分钟（避免误配置打爆）
- 节点测速：探测频率合理（默认 5min），并发数限制（默认 8）

## 数据保留

- `cache/subs/<sub-id>.raw`：覆盖式，仅保留最新一份
- 节点的探测历史**不持久化**（只保留最近一次结果），避免文件膨胀
- 历史趋势数据仅在 `stats/` 下，与节点元数据分离
