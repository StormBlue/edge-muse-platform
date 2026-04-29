# 设计与代码约定

本项目的实现惯例：与现有文件风格对齐，避免引入第二套抽象。

## 服务端（`server/`）

- **框架**：Hono 4 + `@hono/zod-validator`；路由按领域拆文件于 [`server/src/routes/`](../server/src/routes/)，在 [`server/src/index.ts`](../server/src/index.ts) 统一挂载。
- **类型**：领域枚举与 API 形状集中在 [`server/src/types.ts`](../server/src/types.ts)；Worker bindings 通过 `AppEnv` / `AppBindings` 注入。
- **校验**：入参优先 Zod schema（与路由同文件或紧邻）；业务规则错误映射到 [`server/src/lib/errors.ts`](../server/src/lib/errors.ts) 中的 code。
- **数据访问**：Drizzle ORM；表定义与注释见 [`server/src/db/schema.ts`](../server/src/db/schema.ts)；禁止在路由里手写原始 SQL，除非已有先例。
- **Provider**：新协议实现 `ImageProvider`（[`server/src/providers/types.ts`](../server/src/providers/types.ts)），在 [`registry.ts`](../server/src/providers/registry.ts) 注册，与 `request_format` 字符串一致。
- **日志**：结构化 JSON（[`server/src/lib/log.ts`](../server/src/lib/log.ts) / middleware）；禁止记录 API key、完整 prompt 或 base64 图片。
- **ID**：统一用 [`server/src/lib/id.ts`](../server/src/lib/id.ts) 等工具生成带前缀的字符串 ID（如 `ses_`、`tsk_`）。

## 前端（`web/`）

- **栈**：Vue 3 + Vue Router + Pinia；样式 Tailwind v4；组件库以 `reka-ui` + 本地 `components/ui/*` 为主。
- **API**：[`web/src/api/client.ts`](../web/src/api/client.ts) 集中封装 fetch；Cookie 会话与 CSRF 与后端约定一致。
- **国际化**：`vue-i18n`；文案进 locale 文件，避免在视图里硬编码中英混排（现有中文 UI 为主时仍保持 key 可扩展）。

## 横切规则

- **鉴权**：服务端以 `middleware/auth` + `middleware/role` 为准；前端路由 meta 仅 UX，不能替代 API 校验。
- **错误展示**：读取 `error.code` / `message`；网络错误与 401 与 [`docs/API.md`](./API.md) 一致处理。
- **配额与任务**：业务顺序以 [`server/src/lib/tasks.ts`](../server/src/lib/tasks.ts)（实现按职责在 [`server/src/lib/tasks/`](../server/src/lib/tasks/)）为准；前端乐观更新须与 WebSocket 事件可合并。

## 相关文档

- [`EXPERIMENTS.md`](./EXPERIMENTS.md) — 生成入口 A/B 与事件（与 `/api/me`、sysadmin 配合）
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — 运行时与目录级架构
- [`FRONTEND.md`](./FRONTEND.md) — 前端分层
- [`DATABASE.md`](./DATABASE.md) — 数据模型与迁移
- [`SECURITY.md`](./SECURITY.md) — 安全边界
