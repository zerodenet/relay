# 03 · REST API

> Base URL: `/api`，鉴权统一 `Authorization: Bearer <jwt>`，登录接口除外。
> 错误返回格式统一：`{ ok: false, error: { code, message, detail? } }`，HTTP 4xx/5xx。
> 成功统一：`{ ok: true, data }`。

## 鉴权

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/auth/login` | `{ password }` → `{ token, expires_at }` |
| POST | `/api/auth/logout` | 使当前 token 失效 |
| POST | `/api/auth/change-password` | `{ old, new }` |
| GET  | `/api/auth/me` | 当前会话信息 |

## 系统 / 内核

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/system/info` | 面板版本、内核状态、运行时间 |
| GET | `/api/system/kernel` | 内核探测 + 版本 + 健康 |
| POST | `/api/system/kernel/install` | `{ version? }` 下载安装 |
| POST | `/api/system/kernel/start` | 启动 |
| POST | `/api/system/kernel/stop` | 停止 |
| POST | `/api/system/kernel/restart` | 重启 |
| GET | `/api/system/config/preview` | dry-run：编译当前模型为 Zero config |
| POST | `/api/system/config/apply` | 编译并下发到内核 |
| GET | `/api/system/snapshots` | 历史快照列表 |
| GET | `/api/system/snapshots/:ts` | 查看某次快照 |
| POST | `/api/system/snapshots/:ts/rollback` | 回滚 |
| GET | `/api/system/export` | 导出全部数据（zip 流） |
| POST | `/api/system/import` | 上传压缩包恢复（multipart） |
| GET | `/api/system/settings` | 读取面板设置 |
| PATCH | `/api/system/settings` | 修改面板设置 |

## 订阅

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/subscriptions` | 列表 |
| POST | `/api/subscriptions` | 创建 |
| GET | `/api/subscriptions/:id` | 详情 |
| PATCH | `/api/subscriptions/:id` | 修改 |
| DELETE | `/api/subscriptions/:id` | 删除（同时清理来源节点） |
| POST | `/api/subscriptions/:id/sync` | 立即刷新 |
| POST | `/api/subscriptions/sync-all` | 全量刷新 |
| GET | `/api/subscriptions/:id/raw` | 读取原文缓存 |

## 节点

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/nodes` | 列表，支持 `?sub_id=&region=&protocol=&keyword=&alive=` |
| GET | `/api/nodes/:id` | 详情 |
| PATCH | `/api/nodes/:id` | 仅允许 `manual_disabled` / `region` 字段 |
| POST | `/api/nodes/:id/probe` | 单节点立即测速 |
| POST | `/api/nodes/probe-all` | 全量测速 |
| GET | `/api/nodes/regions` | 当前节点池区域统计 |

## 隧道组

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/tunnels` | 列表 |
| POST | `/api/tunnels` | 创建 |
| GET | `/api/tunnels/:id` | 详情 |
| PATCH | `/api/tunnels/:id` | 修改 |
| DELETE | `/api/tunnels/:id` | 删除（前置检查无路由引用） |
| POST | `/api/tunnels/:id/select` | 手动切换 selector 选中节点 |
| POST | `/api/tunnels/:id/probe` | 立即对组内成员测速 |
| GET | `/api/tunnels/:id/members` | 展开实际节点列表（解析嵌套） |

## 入站

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/inbounds` | 列表 |
| POST | `/api/inbounds` | 创建（含 tag 唯一性校验） |
| GET | `/api/inbounds/:id` | 详情 |
| PATCH | `/api/inbounds/:id` | 修改 |
| DELETE | `/api/inbounds/:id` | 删除 |
| POST | `/api/inbounds/:id/toggle` | 启停 |
| POST | `/api/inbounds/:id/generate-keys` | 生成 UUID / Reality 密钥对等 |

## 路由

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/routes` | 列表 |
| POST | `/api/routes` | 创建 |
| GET | `/api/routes/:id` | 详情 |
| PATCH | `/api/routes/:id` | 修改 |
| DELETE | `/api/routes/:id` | 删除 |

## 计量

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/stats/current` | 实时计数器（仪表盘卡片） |
| GET | `/api/stats/timeseries` | `?scope=inbound|tunnel&id=&granularity=hour|day&from=&to=` |
| GET | `/api/stats/summary` | 全局摘要：总入向/出向、活跃连接 |
| GET | `/api/stats/bill` | `?from=&to=&scope=inbound` 账单导出（JSON） |
| GET | `/api/stats/bill.csv` | 同上，CSV 流 |
| POST | `/api/stats/reset` | 重置计数器（管理员，确认参数） |

## 实时事件（SSE）

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/events` | `?topics=stats,flow,kernel,log` 多路复用 |

事件帧格式：

```
event: stats
data: { "inbounds": {...}, "tunnels": {...}, "ts": 1748000000000 }

event: flow
data: { "type": "started|updated|completed", "flow_id": "...", "inbound_tag": "...", "outbound_tag": "...", "bytes_up": 123, "bytes_down": 456 }

event: kernel
data: { "type": "started|stopped|warning", "detail": "..." }

event: log
data: { "level": "info", "msg": "...", "ts": 1748000000000 }
```

## 通用约定

- 时间戳：Unix milliseconds
- 列表分页：`?page=1&size=50`，响应附 `meta: { total, page, size }`
- 排序：`?sort=created_at&order=desc`
- 字符串过滤：`?keyword=`（多字段模糊匹配）

## OpenAPI

后端会暴露 `/api/openapi.json` 与 `/api/docs`（Swagger UI），由 `@fastify/swagger` 自动生成，作为前端类型派生与第三方接入文档。
