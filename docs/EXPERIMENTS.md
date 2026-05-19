# 生成入口与行为事件（EXPERIMENTS）

> **命名说明**：文件名保留 `EXPERIMENTS.md` 以便与历史链接、`AGENTS.md` 对齐。当前实现是 **生成入口开关 + 漏斗事件**，**不包含**按比例随机分流的多臂 A/B 实验表。

## 行为摘要

| 维度                       | 实现                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| 普通用户能看到哪些生图入口 | `generation_entry_settings`：`showWorkspace`、`showAiImage`（至少其一为真）                             |
| 默认首页/导航偏重          | `/api/me` 与登录响应中的 `generationEntry.navTarget`：若工作台开启则为 `/workspace`，否则为 `/ai-image` |
| sysadmin                   | **始终**两入口全开；`/sysadmin/generation-entry` 只影响普通用户与 admin                                 |
| 实验生成目标               | `generationTargets`：默认生成目标 + 按授权下发的 `micu_grok` 米醋 Grok 图像目标                         |

权威逻辑见 [`server/src/lib/generationEntry.ts`](../server/src/lib/generationEntry.ts)。

## HTTP

| 方法  | 路径                                | 说明                                                                                       |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| GET   | `/api/me`、登录响应                 | 返回 `generationEntry: { navTarget, showWorkspace, showAiImage }`                          |
| GET   | `/api/me`、登录响应                 | 返回 `generationTargets`；sysadmin 永远可见 `micu_grok`，admin 需授权                      |
| POST  | `/api/generation/events`            | 登录用户上报 **客户端允许**的事件（见下方 Zod：`clientGenerationEventSchema`）；204 无正文 |
| GET   | `/api/sysadmin/generation-entry`    | sysadmin：`settings`、`usageWindow`、按 `/workspace` 与 `/ai-image` 的提交/成功/失败计数   |
| PATCH | `/api/sysadmin/generation-entry`    | sysadmin：`{ showWorkspace, showAiImage }`，须至少一端为 `true`                            |
| GET   | `/api/sysadmin/generation-features` | sysadmin：读取米醋 Grok 图像实验能力的 admin 授权列表                                      |
| PATCH | `/api/sysadmin/generation-features` | sysadmin：用 `{ micuGrokAdminIds }` 替换获授权 admin 列表                                  |

`POST /api/generate` 可选 body 字段 `generationTargetId` 与 `generationEvent`（路由与案例归因）；任务终态会在服务端补齐 `generate_succeeded` / `generate_failed` 等事件。`generationTargetId=micu_grok` 会走米醋 Grok provider，但仍写入同一套 sessions/messages/tasks、历史和会话审计。

## D1

- **`generation_entry_settings`**：单行，`key='default'`。
- **`generation_events`**：`route`、`eventName`、`caseId`、`taskId`、`metadata`（JSON 字符串，经 sanitize）、`isSysadminPreview`。
- **`generation_feature_grants`**：实验生成能力授权，当前 `feature='micu_grok_image'`，按 admin 用户维度启停；sysadmin 不依赖该表。

事件名全集以 `generationEventNameSchema` / `generationClientEventNameSchema` 为准（同文件）。

## 前端

- 路由守卫与侧栏：`web/src/router/routeGuard.ts`、`web/src/components/layout/useAppShellController.ts`、`generationEntryEvents.ts`。
- 管理 UI：[`web/src/views/sysadmin/GenerationEntry.vue`](../web/src/views/sysadmin/GenerationEntry.vue)。
- 生成目标选择：工作台 [`ChatInput.vue`](../web/src/components/chat/ChatInput.vue) 与 AI 图像页 [`AiImagePromptComposer.vue`](../web/src/views/ai-image/AiImagePromptComposer.vue) 读取 `auth.generationTargets`；只有多个目标时展示选择器。

## 相关文档

- [`DATABASE.md`](./DATABASE.md) — 表说明
- [`API.md`](./API.md)、OpenAPI [`server/src/docs/openapi.ts`](../server/src/docs/openapi.ts)
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — 总览图中的 Worker 链路
