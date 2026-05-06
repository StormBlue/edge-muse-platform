# 生成入口与行为事件（EXPERIMENTS）

> **命名说明**：文件名保留 `EXPERIMENTS.md` 以便与历史链接、`AGENTS.md` 对齐。当前实现是 **生成入口开关 + 漏斗事件**，**不包含**按比例随机分流的多臂 A/B 实验表。

## 行为摘要

| 维度                       | 实现                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| 普通用户能看到哪些生图入口 | `generation_entry_settings`：`showWorkspace`、`showAiImage`（至少其一为真）                             |
| 默认首页/导航偏重          | `/api/me` 与登录响应中的 `generationEntry.navTarget`：若工作台开启则为 `/workspace`，否则为 `/ai-image` |
| sysadmin                   | **始终**两入口全开；`/sysadmin/generation-entry` 只影响普通用户与 admin                                 |

权威逻辑见 [`server/src/lib/generationEntry.ts`](../server/src/lib/generationEntry.ts)。

## HTTP

| 方法  | 路径                             | 说明                                                                                       |
| ----- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| GET   | `/api/me`、登录响应              | 返回 `generationEntry: { navTarget, showWorkspace, showAiImage }`                          |
| POST  | `/api/generation/events`         | 登录用户上报 **客户端允许**的事件（见下方 Zod：`clientGenerationEventSchema`）；204 无正文 |
| GET   | `/api/sysadmin/generation-entry` | sysadmin：`settings`、`usageWindow`、按 `/workspace` 与 `/ai-image` 的提交/成功/失败计数   |
| PATCH | `/api/sysadmin/generation-entry` | sysadmin：`{ showWorkspace, showAiImage }`，须至少一端为 `true`                            |

`POST /api/generate` 可选 body 字段 `generationEvent`（路由与案例归因）；任务终态会在服务端补齐 `generate_succeeded` / `generate_failed` 等事件。

## D1

- **`generation_entry_settings`**：单行，`key='default'`。
- **`generation_events`**：`route`、`eventName`、`caseId`、`taskId`、`metadata`（JSON 字符串，经 sanitize）、`isSysadminPreview`。

事件名全集以 `generationEventNameSchema` / `generationClientEventNameSchema` 为准（同文件）。

## 前端

- 路由守卫与侧栏：`web/src/router/routeGuard.ts`、`web/src/components/layout/useAppShellController.ts`、`generationEntryEvents.ts`。
- 管理 UI：[`web/src/views/sysadmin/GenerationEntry.vue`](../web/src/views/sysadmin/GenerationEntry.vue)。

## 相关文档

- [`DATABASE.md`](./DATABASE.md) — 表说明
- [`API.md`](./API.md)、OpenAPI [`server/src/docs/openapi.ts`](../server/src/docs/openapi.ts)
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — 总览图中的 Worker 链路
