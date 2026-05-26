# 04 · 内核对接

## 概览

Zero 控制面提供三种通道，本面板按以下顺序使用：

1. **IPC（首选）**：`~/.zero/control.sock`（Linux），无端口冲突，文件系统权限隔离
2. **HTTP（备选）**：`127.0.0.1:9090`，远程或调试时使用
3. **CLI（不直接使用）**：仅在脚本场景

## 探测流程

```
detector.ts:
  1. settings.kernel.binary_path 是否存在 + 可执行？
  2. `<binary> --version` 解析版本号
  3. 探测运行状态：
     a. ipc: connect ~/.zero/control.sock，发送 {"type":"query","request":"Health"}
     b. http: GET http://127.0.0.1:9090/api/v1/runtime
  4. systemd 兼容：systemctl is-active zero（manage_mode=systemd 时）
```

`KernelStatus` 在面板启动后立即写入 `kernel.json`，每 10 秒轮询刷新。

## 安装流程

```
installer.ts:
  1. 解析 release：fetch https://api.github.com/repos/zerodenet/zero/releases
  2. 选择版本（默认 latest）+ 当前架构（x86_64 / aarch64）
  3. 下载二进制（带进度反馈）
  4. 校验：sha256 比对 release notes 内的校验和
  5. 写入 settings.kernel.binary_path
  6. 生成 systemd unit（manage_mode=systemd 时）
  7. systemctl daemon-reload && enable && start
```

## 启停接管模式

| 模式 | 说明 | 适用 |
|---|---|---|
| `spawn` | 面板作为父进程 fork 内核 | 单机简单部署 |
| `systemd` | 面板调用 `systemctl start/stop zero` | 生产推荐 |
| `external` | 面板只通信，不管理生命周期 | 内核已被其他工具管理 |

## 控制面客户端 (`kernel/client.ts`)

```ts
interface KernelClient {
  // 查询
  query<T>(request: QueryRequest): Promise<T>
  // 命令
  command<T>(method: string, params: object): Promise<T>
  // 订阅事件流（统一封装为 AsyncIterable）
  subscribe(events: string[]): AsyncIterable<KernelEvent>
  // 健康
  health(): Promise<{ ok: boolean, version?: string }>
}
```

实现要点：

- IPC：JSON-line over Unix socket，自动重连（指数退避，5s/15s/30s）
- HTTP：`fetch` + `EventSource` polyfill（Node 内置 undici）
- 故障切换：IPC 不可用时降级 HTTP
- 串行化：每个连接同时只处理一个请求/响应（避免帧错乱）

## 关键操作

| 业务动作 | 内核命令 |
|---|---|
| 下发新配置 | `command('config.apply', { config })` |
| 切换 selector | `command('policies.select', { policy_tag, target_tag })` |
| 触发探测 | `command('policies.probe', { policy_tag })` |
| 关闭单连接 | `command('flows.close', { flow_id })` |
| 拉取活跃连接 | `query({ ActiveFlows: { limit: 100, filter: {} } })` |
| 拉取运行时 | `query('Runtime')` |
| 拉取策略组 | `query('Policies')` |

## 事件订阅策略

面板只订阅必须的事件，按需启用：

| 事件 | 用途 | 订阅时机 |
|---|---|---|
| `flow.completed` | 计量累加 | 全程订阅 |
| `flow.updated` | 实时速率 | 仪表盘打开时启用，关闭时停 |
| `flow.started` | 实时连接表 | 仅 Logs / Connections 页面 |
| `policy.selected` | 隧道切换通知 | 全程 |
| `stats.sampled` | 全局统计 | 全程 |
| `engine.warning` | 异常告警 | 全程 |
| `config.changed` | 校验下发结果 | 全程 |

## 配置下发的 dry-run

```
preview 接口 不向内核 发请求：
  1. compiler.build(model) → ZeroConfig
  2. 与最近一次 snapshot 做 JSON diff
  3. 返回：{ config, diff_summary, warnings: [...] }

apply 接口：
  1. preview 流程
  2. 备份当前快照
  3. command('config.apply', { config })
  4. 等待 config.changed 事件确认
  5. 失败回滚（恢复上一个快照并重发）
```

## 失败处理

- 内核未运行：API 返回 `409 Conflict { code: "KERNEL_DOWN" }`，前端引导用户启动
- 下发失败：保留新模型在 `data/`，但 snapshots 标记 `apply_failed=true`，UI 提示
- IPC 中断：进入重连循环，事件订阅恢复后从最近一次同步点继续

## 安全

- IPC socket 文件权限 `0600`，与运行用户隔离
- HTTP 控制面仅监听 `127.0.0.1`，远程访问通过面板 BFF 反代（自带鉴权）
- token（HTTP 模式）存于 `settings.kernel.auth_token`，不出现在前端
