# 部署与环境

## 本地开发

- Worker：`pnpm dev:server` 或 `pnpm -F server dev`（Wrangler dev，默认 `8787`；脚本会注入 `ENVIRONMENT=dev`，本地默认不渲染验证码）。
- 前端：`pnpm dev:web`（Vite，默认 `5173`）。
- 并行：`pnpm dev`（workspace 并行）。

首次本地数据：

```bash
cp server/.dev.vars.example server/.dev.vars
pnpm -F server db:migrate:local
pnpm -F server seed:local
```

本地 `.dev.vars` 仍用于 JWT、加密密钥等开发密钥；即使其中保留 Turnstile / 腾讯 / ALTCHA 测试配置，`ENVIRONMENT=dev` 且未保存系统设置时 `/api/config` 会返回 `captcha.provider=disabled`，避免 localhost 触发验证码域名或 challenge 配置错误。需要本地联调验证码时，可由 sysadmin 在「系统设置」保存 Tencent、Turnstile、ALTCHA 或关闭模式，D1 中的设置会覆盖 dev 默认值。

变量说明见根目录 [`README.md`](../README.md)。

## 构建

```bash
pnpm build
```

等价于 `web` 的 `vite build` + `server` 的 `wrangler deploy --dry-run` 产物；实际静态资源与 Worker 打包关系见 [`server/wrangler.jsonc`](../server/wrangler.jsonc)。

## 线上（Cloudflare）

1. 在 Cloudflare 创建 D1、R2、KV、Turnstile、AI Gateway 等资源；在腾讯云验证码控制台创建验证码应用；如启用 ALTCHA，准备随机高熵 HMAC secret。
2. 将 D1 / KV 等 ID 填入 `server/wrangler.jsonc`；Turnstile site key、腾讯 `TENCENT_CAPTCHA_APP_ID`、`ALTCHA_DEFAULT_DIFFICULTY` 等非敏感配置进 Worker vars。
3. 写入 Secrets：`JWT_SECRET`、`KEY_ENCRYPTION_KEY`、`TURNSTILE_SECRET_KEY`、`ALTCHA_HMAC_KEY`、`TENCENT_CAPTCHA_APP_SECRET_KEY`、`TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY` 等（见 README）。
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
