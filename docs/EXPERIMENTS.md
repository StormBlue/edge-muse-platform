# 生成入口 A/B 与实验事件

本页说明**普通用户生成入口**的流量分配、客户端事件采集与系统管理配置；D1 表摘要见 [`DATABASE.md`](./DATABASE.md) 主要实体表。

## 数据存储与代码入口

- **D1**：[`experiments`](../server/src/db/schema.ts)（单条「生成体验」实验配置，key 由 [`GENERATION_EXPERIENCE_KEY`](../server/src/lib/generationExperimentConstants.ts) 固定）、`experiment_assignments`（按用户覆盖变体）、`experiment_events`（结构化事件行）。
- **聚合出口**：[`server/src/lib/experiments.ts`](../server/src/lib/experiments.ts) 再导出 `experimentCore`、`experimentAssignments`、`experimentEventRecorder`、`experimentSchemas` 等模块，路由与业务只依赖本文件。
- **事件名称与指标规则**：[`server/src/lib/generationExperimentEvents.ts`](../server/src/lib/generationExperimentEvents.ts) 维护 catalog（哪些事件允许客户端上报、是否计入主指标、重试相关名称等）。

## 运行时行为

1. **分配**：[`getGenerationExperienceForUser`](../server/src/lib/experimentAssignments.ts) 在登录与 [`GET /api/me`](../server/src/routes/me.ts) 时计算，返回 [`GenerationExperience`](../server/src/lib/experimentTypes.ts)（含前端首页 `navTarget`，如 `/ai-image` 或 `/workspace`）。
2. **客户端事件**：已登录用户可对 [`POST /api/experiments/events`](../server/src/routes/experiments.ts) 上报结构化事件 body（Zod：`clientExperimentEventSchema`）；服务端重写 variant，避免伪造污染指标。
3. **生成与重试挂钩**：[`POST /api/generate`](../server/src/routes/generate.ts) 与任务重试可携带 `experimentEvent`（如提交类事件）；Prompt 助手链路中亦会调用 `recordExperimentEvent`（见 [`promptAssistant.ts`](../server/src/routes/promptAssistant.ts)）。
4. **系统管理**：[`/api/sysadmin/experiments/generation*`](../server/src/routes/sysadmin/generationExperiment.ts) 读取/更新实验、查看指标窗口、管理按用户分配覆盖；在 [`sysadmin.ts`](../server/src/routes/sysadmin.ts) 中注册。
5. **前端**：普通用户 [`/ai-image`](../web/src/views/ai-image/AiImageGeneration.vue) 与 [`/workspace`](../web/src/views/workspace/Workspace.vue) 并存；首页由 [`homePath`](../web/src/router/homePath.ts) 根据 `generationExperience.navTarget` 决定。配置页 [`/sysadmin/experiments/generation`](../web/src/views/sysadmin/GenerationExperiment.vue)。

## 测试

集成测试见 [`server/test/experiments.*.integration.test.ts`](../server/test/) 与 [`experimentTestUtils.ts`](../server/test/experimentTestUtils.ts)。

## 相关文档

- [`design-docs/ai-image-generation-page.md`](./design-docs/ai-image-generation-page.md) — 产品侧入口与 A/B 背景
- [`API.md`](./API.md) — HTTP 区域总览
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — Worker 与数据流
