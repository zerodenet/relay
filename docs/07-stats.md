# 07 · 计量与统计

## 设计目标

- 以**入站端口**为最小计费单元，统计**双向流量**（入向 / 出向）
- 兼顾实时仪表盘 + 历史账单导出
- **JSON 文件存储**，无数据库依赖
- 计量数据丢失可容忍（最多丢 1 分钟），但不能影响转发

## 计量维度

| 维度 | 说明 |
|---|---|
| **入站端口** | 一个 inbound = 一份账单单元（核心） |
| **隧道组** | 监控隧道使用情况，不直接计费 |
| **节点** | 仅做实时关联展示，不做长期聚合 |

## 双向定义

> 站在面板服务器视角：

| 方向 | 含义 |
|---|---|
| `bytes_up` | **客户 → 你（inbound 入向）→ 隧道（outbound 出向）** = 上行 |
| `bytes_down` | **隧道 → 你 → 客户** = 下行 |

inbound 和 tunnel 共享同一对方向定义（同一条 flow 的两侧字节数相同），便于交叉核对。

## 数据采集

```
collector.ts：
  订阅内核事件 flow.completed
  ↓
  为每个完成的 flow：
    - 提取 inbound_tag / outbound_tag / bytes_up / bytes_down / duration
    - 找到对应 inbound_id / tunnel_id（tag → id 反查表，启动时构建）
    - 内存累计：
        current.inbounds[inbound_id].bytes_up += ...
        current.inbounds[inbound_id].bytes_down += ...
        current.tunnels[tunnel_id].bytes_up += ...
        current.tunnels[tunnel_id].bytes_down += ...
        current.inbounds[inbound_id].total_conns += 1
```

订阅 `flow.started` / `flow.updated` 仅用于实时面板，不写入计量。

## 持久化策略

```
内存计数器（current）
  ↓ 每 60 秒（可配）
stats/current.json  ← 整体覆盖写
  ↓ 每整点
stats/hourly/<YYYY-MM-DD>.json  ← 当天文件追加 1 个 bucket
  ↓ 每天 00:05
stats/daily.json  ← 追加昨日聚合
```

故障容忍：

- 进程崩溃最多丢 60 秒（current 未刷盘）
- hourly/daily 由内存原子计算 + 当天文件原子写，整点漂移用本机时钟即可

## 文件结构详见

参见 [02 数据模型](./02-data-model.md) 的 `stats/*` 部分。

## 聚合规则

```ts
hourlyBucket = sum(flow.completed events in [hour_start, hour_end))
dailyBucket  = sum(hourlyBuckets of that day)
```

聚合时使用 flow 的 **结束时间**（`occurred_at_unix_ms`）归属时段。跨小时长连接整体归到结束时段（简化处理，对账单影响可忽略）。

## 时序查询

`/api/stats/timeseries`：

```
入参：
  scope:       inbound | tunnel
  id:          实体 id
  granularity: hour | day
  from:        unix ms
  to:          unix ms

逻辑：
  granularity=hour 且 to-from <= 7d：从 stats/hourly/* 拼装
  granularity=day  且 to-from <= 90d：从 stats/daily.json 切片
  超过保留窗口：返回稀疏数据 + 提示

返回：
  [
    { ts, bytes_up, bytes_down, active_conns? },
    ...
  ]
```

## 账单导出

`/api/stats/bill`：

```
入参：
  from / to   时间范围
  scope       inbound（默认）| tunnel | all

返回 JSON / CSV：
  inbound_id, inbound_name, inbound_tag,
  bytes_up, bytes_down, bytes_total,
  total_conns,
  period_start, period_end
```

CSV 列额外含 `bytes_total_GiB` 浮点便于直接核账。

## 重置

`POST /api/stats/reset` 需带 `confirm=true`：

```
1. 备份 stats/current.json → stats/.archive/<ts>.json
2. 重置内存计数器
3. 立即刷盘
4. hourly / daily 不动（保留历史）
```

## 数据保留

| 文件 | 保留 |
|---|---|
| `current.json` | 永久（实时） |
| `hourly/*.json` | 默认 31 天 |
| `daily.json` | 默认 90 天（可配） |
| `.archive/*.json` | 默认 12 份 |

清理在每天 03:00 触发。

## 实时事件转发

仪表盘订阅 `/api/events?topics=stats` 时：

```
后端将内核 flow.updated / stats.sampled 事件
  → 折算为 inbound / tunnel 维度的瞬时增量
  → 推送给前端（频率限流：每秒最多 1 帧）
```

前端用 ECharts 滚动窗口展示最近 5 分钟。

## 一致性兜底

- 启动时校验：`current.json` 时间戳超过 5 分钟未更新 → 触发完整重建
- `flow.completed` 事件携带 `occurred_at`，用于检测乱序（乱序事件忽略）
- 订阅断流时进入"待补"状态，恢复后从 `query Stats` 拉取增量做对账
