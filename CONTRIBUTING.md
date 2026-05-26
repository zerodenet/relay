# Contributing

## Branch Strategy

| 分支 | 用途 | 保护 |
|---|---|---|
| `main` | 稳定发布，仅通过合并 PR 更新 | 是 |
| `develop` | 日常开发，对外展示最新进展 | 是 |
| `feature/*` | 新功能开发 | 否 |
| `fix/*` | Bug 修复 | 否 |

### 工作流

```
feature/xxx  ──PR──→  develop  ──PR──→  main ──tag──→  Release
fix/xxx      ──PR──→  develop
```

- 所有变更通过 **Pull Request** 合并，不允许直接 push 到 `main` 或 `develop`
- `feature/*` 和 `fix/*` 从 `develop` 拉出，完成后 PR 回 `develop`
- 发布时从 `develop` PR 到 `main`，合并后在 `main` 上打 tag 触发自动发布

### Tag 规范

| 格式 | 含义 | 触发 Release | 标记 latest |
|---|---|---|---|
| `v0.0.1` | 正式版 | 是 | 是 |
| `v0.1.0-rc.1` | 候选版 | 是（pre-release） | 否 |
| `v0.1.0-beta.1` | 测试版 | 是（pre-release） | 否 |
| `v0.1.0-alpha.1` | 内测版 | 是（pre-release） | 否 |

- Tag 只在 `main` 分支上触发发布，非 `main` 上的 tag 会被 CI 拒绝
- 含 `-rc` / `-beta` / `-alpha` / `-pre` / `-dev` 后缀的 tag 自动标记为 pre-release

## Development

```bash
pnpm install
pnpm dev           # 同时启动 server + web 开发服务器
pnpm build         # 构建所有包
pnpm typecheck     # 类型检查
```

## Commit Convention

```
feat: 新功能
fix: 修复 bug
docs: 文档变更
refactor: 重构
chore: 构建/工具变更
```
