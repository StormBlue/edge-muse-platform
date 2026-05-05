# 设计决策索引

本目录用于存放**短小的、稳定的**架构/产品决策摘要；长篇实施记录已归档到 [`../archive/`](../archive/README.md)。

## 已记录决策（代码即真相）

| 主题               | 结论                                                              | 代码 / 文档锚点                                                                                                                    |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 多服务商协议分轨   | `request_format` 选择 `openai_compatible` vs `openai_images`      | [`server/src/providers/registry.ts`](../../server/src/providers/registry.ts)                                                       |
| 内置服务商         | 米醋 API + Cubence 由 catalog 自动补齐，禁止删除内置 provider     | [`server/src/providers/catalog.ts`](../../server/src/providers/catalog.ts)                                                         |
| 密钥解析无全局兜底 | 用户必须偏好密钥或显式绑定                                        | [`server/src/lib/providerKeys.ts`](../../server/src/lib/providerKeys.ts)                                                           |
| Provider 能力边界  | 仅文生图/图生图；服务商限制在任务创建前拦截                       | [`server/src/lib/tasks/providerParams.ts`](../../server/src/lib/tasks/providerParams.ts)、[`docs/USER_GUIDE.md`](../USER_GUIDE.md) |
| 生成入口 A/B       | D1 存配置/覆盖/事件；服务端重算 variant；sysadmin 配流量与指标    | [`docs/EXPERIMENTS.md`](../EXPERIMENTS.md)、[`server/src/lib/experiments.ts`](../../server/src/lib/experiments.ts)                 |
| AI 图像生成页面    | 普通用户 `/ai-image` 与经典工作台并存；案例与实验由 sysadmin 管理 | [`ai-image-generation-page.md`](./ai-image-generation-page.md)                                                                     |

## 归档参考

- Cubence 接入任务全书（含发布清单与风险表）：[`../archive/CUBENCE_INTEGRATION_TASKS.md`](../archive/CUBENCE_INTEGRATION_TASKS.md)
- v1.0 需求 PRD：[`../archive/开发需求.md`](../archive/开发需求.md)
