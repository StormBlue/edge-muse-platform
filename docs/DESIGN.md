# 设计与代码约定

前后端共享的工程惯例；**架构与数据流**见根目录 [`ARCHITECTURE.md`](../ARCHITECTURE.md)，**安全边界**见 [`SECURITY.md`](./SECURITY.md)。

## Monorepo

- **包**：[`server/`](../server/)（Cloudflare Worker）、[`web/`](../web/)（Vite + Vue 3）；根 [`package.json`](../package.json) 提供 `pnpm dev` / `build` / `lint` / `typecheck` / `test`。
- **共享领域类型**：[`server/src/types.ts`](../server/src/types.ts)；前端通过 API 响应与 store 使用同类字段，避免重复定义不一致的「影子类型」。

## 服务端（Worker）

- **入口**：[`server/src/index.ts`](../server/src/index.ts) — 中间件链、路由挂载、WebSocket、`scheduled` cron。
- **路由**：[`server/src/routes/`](../server/src/routes/) — Hono，`AppEnv` 注入 `db` / `env` / 当前用户等；新资源区段独立文件并在入口注册。
- **校验**：请求体用 Zod（`@hono/zod-validator`）；错误经统一中间件转换为 API 错误体（见下文）。
- **任务域门面**：业务与 Workflow/DO 仅依赖 [`server/src/lib/tasks.ts`](../server/src/lib/tasks.ts)；实现位于 [`server/src/lib/tasks/`](../server/src/lib/tasks/)，避免子模块路径泄漏到路由层。
- **Provider**：适配器在 [`server/src/providers/`](../server/src/providers/)，`request_format` 在 [`registry.ts`](../server/src/providers/registry.ts) 注册；能力与限制在任务创建前拦截（如 [`providerParams.ts`](../server/src/lib/tasks/providerParams.ts)）。
- **数据访问**：Drizzle + D1，Schema [`server/src/db/schema.ts`](../server/src/db/schema.ts)；迁移流程见 [`DATABASE.md`](./DATABASE.md)。

## 错误与 HTTP 响应

- 对外统一 `{ error: { code, message, details } }`（[`docs/API.md`](./API.md)）。
- 实现参考：[`server/src/middleware/error.ts`](../server/src/middleware/error.ts)、[`server/src/lib/errors.ts`](../server/src/lib/errors.ts)。
- **禁止**：在日志或响应中输出上游 API Key 明文或其它凭据。

## 认证与客户端请求

- Cookie / JWT：`auth` 中间件、[`jwt.ts`](../server/src/lib/jwt.ts)、[`cookies.ts`](../server/src/lib/cookies.ts)。
- 可变方法需 CSRF：`X-CSRF-Token` 与 `em_csrf` Cookie（见 [`SECURITY.md`](./SECURITY.md)）。

## 前端（Vue）

- **入口与路由**：[`web/src/main.ts`](../web/src/main.ts)、[`web/src/router/index.ts`](../web/src/router/index.ts)。
- **状态**：Pinia stores（`auth` 能力与用户、`session` 消息与任务合并等）；详见 [`FRONTEND.md`](./FRONTEND.md)。
- **API**：[`web/src/api/client.ts`](../web/src/api/client.ts) — base URL、Cookie、CSRF、错误解析集中处理。
- **实时任务**：[`useTaskWebSocket.ts`](../web/src/composables/useTaskWebSocket.ts) 与 session store 协作；不重接第二套 socket 抽象。

## 依赖与修改策略

- 改 D1：先改 schema → `pnpm -F server db:gen` → 审 SQL → 本地/远程迁移（[`DATABASE.md`](./DATABASE.md)）。
- 改对外 HTTP 契约：同步 [`server/src/docs/openapi.ts`](../server/src/docs/openapi.ts) 与 [`API.md`](./API.md) 摘要。
- 改生成入口或漏斗：同步 [`EXPERIMENTS.md`](./EXPERIMENTS.md) 与前后端对 `generationEntry` 的消费。

## 相关文档

- [`ARCHITECTURE.md`](../ARCHITECTURE.md)
- [`FRONTEND.md`](./FRONTEND.md)
- [`API.md`](./API.md)
- [`TESTING.md`](./TESTING.md)
