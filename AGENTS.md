# Edge Muse Platform

基于 Cloudflare Workers（Hono、D1、R2、KV、Durable Objects、Workflows）与 Vue 3 的多服务商图片生成平台；密钥与配额由 sysadmin/admin 人工开通，无公开注册。

本文件是 **AI 编码助手的入口**：先读本节，再按需跳转到 `docs/` 与 [`ARCHITECTURE.md`](ARCHITECTURE.md)。

## 快速开始

```bash
pnpm install
pnpm -F server types
pnpm dev
```

- 前端：`http://localhost:5173`（`pnpm dev:web`）
- Worker API：`http://localhost:8787/api/health`（`pnpm dev:server`）

常用：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`；数据库：`pnpm -F server db:migrate:local` / `seed:local`。环境变量见根目录 [`README.md`](README.md)。

## 仓库结构

| 路径                    | 说明                                                                        |
| ----------------------- | --------------------------------------------------------------------------- |
| `server/src/index.ts`   | Worker 入口：中间件、路由挂载、WebSocket、cron                              |
| `server/src/routes/`    | REST 路由（auth、me、sessions、generate、images、uploads、admin、sysadmin） |
| `server/src/lib/`       | 任务、配额、密钥解析、R2、JWT、审计等业务库                                 |
| `server/src/providers/` | 多服务商适配器与内置 catalog                                                |
| `server/src/workflows/` | 生图 Workflow                                                               |
| `server/src/do/`        | Durable Objects                                                             |
| `server/src/db/`        | Drizzle schema 与 migrations                                                |
| `web/src/`              | Vue 应用：views、components、stores、router                                 |

## 架构一览

单一 Worker 托管 API + SPA 静态资源；异步生图走 Workflow/`waitUntil`，状态经 Durable Object WebSocket 推送到浏览器。Provider 由 `request_format` 选择；内置米醋 API 与 Cubence 由 catalog 维护。详见 [`ARCHITECTURE.md`](ARCHITECTURE.md)。

## 文档地图

| 文档                                                     | 内容                         |
| -------------------------------------------------------- | ---------------------------- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                     | 组件图、数据流、关键文件索引 |
| [`docs/README.md`](docs/README.md)                       | `docs/` 目录索引             |
| [`docs/DESIGN.md`](docs/DESIGN.md)                       | 代码组织与约定               |
| [`docs/API.md`](docs/API.md)                             | REST 路径与错误格式          |
| [`docs/DATABASE.md`](docs/DATABASE.md)                   | D1 表与迁移流程              |
| [`docs/FRONTEND.md`](docs/FRONTEND.md)                   | Vue 路由、状态、组件分层     |
| [`docs/SECURITY.md`](docs/SECURITY.md)                   | 认证、密钥、数据边界         |
| [`docs/RELIABILITY.md`](docs/RELIABILITY.md)             | 任务恢复、cron、备份         |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)               | Wrangler、CI/CD、环境        |
| [`docs/TESTING.md`](docs/TESTING.md)                     | Vitest 与验证命令            |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md)               | 迁移、密钥、日志、演练       |
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md)               | 终端用户说明                 |
| [`docs/DEMO.md`](docs/DEMO.md)                           | 内部演示脚本                 |
| [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)               | 验收与发布前检查             |
| [`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md)         | 质量与已知债                 |
| [`docs/PRODUCT_SENSE.md`](docs/PRODUCT_SENSE.md)         | 角色与核心旅程               |
| [`docs/design-docs/index.md`](docs/design-docs/index.md) | 设计决策索引                 |
| [`docs/archive/README.md`](docs/archive/README.md)       | 已归档 PRD / 任务书          |

## 关键约定

1. **类型与领域类型**：共享类型在 [`server/src/types.ts`](server/src/types.ts)；路由用 Hono `AppEnv`。
2. **密钥**：上游 API Key 仅密文存 D1；解析与能力快照见 `lib/providerKeys.ts`；禁止把明文密钥打进日志或响应。
3. **配额**：`createGenerateTask` 内按张数预扣；非服务商错误的失败路径需按业务退还（见 `lib/tasks.ts`）。
4. **Provider 能力**：`openai_images`（Cubence）限制 chat、多参考图等，前后端须一致（`/api/me` 带 `providerCapabilities`）。
5. **错误响应**：统一 `{ error: { code, message, details } }`（见 `docs/API.md`）。
6. **迁移**：schema 变更走 `pnpm -F server db:gen`，提交 SQL 后再 `db:migrate:local` / remote。

## 常见任务

- **新增 API**：在 `server/src/routes/` 增加路由并在 `index.ts` 挂载；补 Zod 校验与角色中间件。
- **改 D1**：改 `server/src/db/schema.ts` → `db:gen` → 审 SQL → 迁移。
- **新前端页面**：`web/src/router/index.ts` 注册路由；权限与布局参考现有 `views/`。
- **接入新 provider 形态**：在 `providers/` 实现 `ImageProvider`，`registry.ts` 注册，`request_format` 与 catalog 策略与运维文档同步。

## 工具说明

本仓库使用 Cursor 时可将本文件作为项目记忆入口；与 Claude Code 共用同一套 `docs/`，无需维护两套文档地图。
