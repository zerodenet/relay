# Zero Relay Panel 文档

> 基于 [zerodenet/zero](https://github.com/zerodenet/zero) 内核的透明 L7 中转网关编排面板。

## 文档索引

| 编号 | 文档 | 内容 |
|---|---|---|
| 00 | [产品概览](./00-overview.md) | 产品定位、目标用户、核心场景 |
| 01 | [总体架构](./01-architecture.md) | 进程拓扑、模块划分、技术栈 |
| 02 | [数据模型](./02-data-model.md) | JSON 文件布局与所有 schema |
| 03 | [REST API](./03-api.md) | 后端 BFF 对前端暴露的接口 |
| 04 | [内核对接](./04-kernel-integration.md) | Zero 控制面通信 / 探测 / 安装 |
| 05 | [配置编译器](./05-config-compiler.md) | 内存模型 → Zero config.json |
| 06 | [订阅与节点](./06-subscription.md) | 订阅源解析、节点池、健康检查 |
| 07 | [计量与统计](./07-stats.md) | 流量聚合、账单导出 |
| 08 | [前端规划](./08-frontend.md) | 页面结构、组件、交互 |
| 09 | [部署运维](./09-deployment.md) | systemd、目录、备份恢复 |
| 10 | [路线图](./10-roadmap.md) | 版本规划与里程碑 |

## 阅读顺序建议

- 第一次了解项目：00 → 01 → 02 → 05
- 后端开发：02 → 03 → 04 → 05 → 06 → 07
- 前端开发：03 → 08
- 运维部署：09 → 04
