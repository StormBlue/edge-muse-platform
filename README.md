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
```

## 环境变量与密钥

本地创建 `server/.dev.vars`:

```ini
JWT_SECRET=replace-with-local-secret
KEY_ENCRYPTION_KEY=replace-with-32-byte-or-longer-secret
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
RESEND_API_KEY=
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

1. 在 Cloudflare 创建 D1、R2、KV、Turnstile、AI Gateway。
2. 将真实资源 ID 填入 `server/wrangler.jsonc` 的 `env.staging` 与 `env.production`。
3. 运行迁移:

```bash
pnpm -F server db:migrate:staging
```

4. 部署 staging:

```bash
pnpm -F server deploy:staging
```

生产环境使用 tag 触发 GitHub Actions，或手动运行 `pnpm -F server deploy:prod`。
