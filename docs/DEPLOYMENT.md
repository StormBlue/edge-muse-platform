# 部署与环境

## 本地开发

- Worker：`pnpm dev:server` 或 `pnpm -F server dev`（Wrangler dev，默认 `8787`）。
- 前端：`pnpm dev:web`（Vite，默认 `5173`）。
- 并行：`pnpm dev`（workspace 并行）。

首次本地数据：

```bash
cp server/.dev.vars.example server/.dev.vars
pnpm -F server db:migrate:local
pnpm -F server seed:local
```

变量说明见根目录 [`README.md`](../README.md)。

## 构建

```bash
pnpm build
```

等价于 `web` 的 `vite build` + `server` 的 `wrangler deploy --dry-run` 产物；实际静态资源与 Worker 打包关系见 [`server/wrangler.jsonc`](../server/wrangler.jsonc)。

## 线上（Cloudflare）

1. 在 Cloudflare 创建 D1、R2、KV、Turnstile、AI Gateway 等资源。
2. 将 D1 / KV 等 ID 填入 `server/wrangler.jsonc`；站点密钥进 Worker 环境变量 / Secrets。
3. 写入 Secrets：`JWT_SECRET`、`KEY_ENCRYPTION_KEY`、`TURNSTILE_SECRET_KEY` 等（见 README）。
4. 执行远程迁移：`pnpm -F server db:migrate:remote`。
5. 部署：`pnpm -F server deploy`。

`RESEND_API_KEY` 与 `ALERT_EMAIL` 为**可选**运维告警；账号创建不依赖邮件。

## CI/CD

| 工作流 | 文件                                                              | 行为                                                                                   |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| CI     | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)         | 安装、lint、typecheck、test、build                                                     |
| Deploy | [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) | `main` 推送：`build` → `db:migrate:remote` → `deploy`（需 GitHub Environment secrets） |

CI 使用 Node **24**（与 deploy 工作流一致）；本地可使用 `.nvmrc` 指定版本。

## 相关文档

- [`OPERATIONS.md`](./OPERATIONS.md) — 密钥轮换、回滚、演练
- [`TESTING.md`](./TESTING.md) — 发布前验证命令
- [`ACCEPTANCE.md`](./ACCEPTANCE.md) — 验收项
