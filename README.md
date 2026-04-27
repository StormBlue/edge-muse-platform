# Edge Muse Platform

Edge Muse Platform 是一个基于 Cloudflare Workers、D1、R2、Durable Objects、Workflows 与 Vue 3 的多服务商图片生成平台。

## 本地开发

```bash
pnpm install
pnpm -F server types
pnpm dev
```

- Web: `http://localhost:5173`
- Worker API: `http://localhost:8787/api/health`

## 常用命令

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm -F server db:gen
pnpm -F server db:migrate:local
pnpm -F server db:migrate:remote
pnpm -F server deploy
```

## 环境变量与密钥

本地创建 `server/.dev.vars`:

```ini
ENVIRONMENT=dev
JWT_SECRET=replace-with-local-secret
KEY_ENCRYPTION_KEY=replace-with-32-byte-or-longer-secret
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
RESEND_API_KEY=
AI_GATEWAY_URL=
TURNSTILE_SITE_KEY=1x00000000000000000000AA
ALERT_EMAIL=
```

Cloudflare 线上环境使用 `wrangler secret put` 写入同名密钥。

初始化本地数据:

```bash
cp server/.dev.vars.example server/.dev.vars
pnpm -F server db:migrate:local
pnpm -F server seed:local
```

本地默认账号: `sysadmin@example.com` / `password123`。

## 部署

1. 在 Cloudflare 创建一套线上资源:D1、R2、KV、Turnstile、AI Gateway。
2. 将真实 D1 / KV ID 填入 `server/wrangler.jsonc`,并配置 `TURNSTILE_SITE_KEY` / `AI_GATEWAY_URL`。
3. 写入线上 Worker Secrets:

```bash
pnpm -F server wrangler secret put JWT_SECRET
pnpm -F server wrangler secret put KEY_ENCRYPTION_KEY
pnpm -F server wrangler secret put TURNSTILE_SECRET_KEY
```

`RESEND_API_KEY` 仅用于可选运维告警邮件;账号创建和密码重置由管理员手动完成,不依赖邮件服务。

4. 运行线上迁移:

```bash
pnpm -F server db:migrate:remote
```

5. 部署线上 Worker + SPA:

```bash
pnpm -F server deploy
```

GitHub Actions 在 `main` 分支推送时执行同一套 `db:migrate:remote` + `deploy` 流程。

## 文档

- AI 助手入口：[AGENTS.md](./AGENTS.md)
- 架构详解：[ARCHITECTURE.md](./ARCHITECTURE.md)
- 完整索引：[docs/README.md](./docs/README.md)
