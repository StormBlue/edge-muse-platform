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
- API 文档: `http://localhost:8787/api/docs`
- OpenAPI JSON: `http://localhost:8787/api/openapi.json`

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
AI_GATEWAY_ID=default
AI_GATEWAY_URL=
CAPTCHA_DOMESTIC_PROVIDER=tencent
CAPTCHA_OVERSEAS_PROVIDER=turnstile
ALTCHA_DEFAULT_DIFFICULTY=50000
ALTCHA_HMAC_KEY=replace-with-local-altcha-secret
TENCENT_CAPTCHA_APP_ID=
TENCENT_CAPTCHA_APP_SECRET_KEY=
TENCENTCLOUD_SECRET_ID=
TENCENTCLOUD_SECRET_KEY=
TENCENTCLOUD_CAPTCHA_REGION=ap-guangzhou
TURNSTILE_SITE_KEY=1x00000000000000000000AA
ALERT_EMAIL=
```

Cloudflare 线上环境使用 `wrangler secret put` 写入同名密钥。

登录验证码按 Cloudflare `CF-IPCountry` 分流：中国大陆访问默认腾讯云验证码，其他地区默认 Turnstile。sysadmin 可在「系统设置」里将国内/国外 provider 分别切到 `tencent`、`turnstile`、`altcha` 或 `disabled`，并配置 ALTCHA challenge 难度；数据库设置优先生效，环境变量作为兜底默认值。腾讯云验证码需要预留并配置 `TENCENT_CAPTCHA_APP_ID`、`TENCENT_CAPTCHA_APP_SECRET_KEY`、`TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY`；ALTCHA 需要配置 `ALTCHA_HMAC_KEY`，Worker 只做签名、hash 和 KV 防重放校验，PoW 求解在浏览器完成。

初始化本地数据:

```bash
cp server/.dev.vars.example server/.dev.vars
pnpm -F server db:migrate:local
pnpm -F server seed:local
```

本地 `pnpm -F server dev` 会显式注入 `ENVIRONMENT=dev`，登录页不会渲染验证码；`.dev.vars` 里的 Turnstile / 腾讯 / ALTCHA 测试配置仅用于保留环境结构。

本地默认账号: `sysadmin@example.com` / `password123`。

## 部署

1. 在 Cloudflare 创建一套线上资源:D1、R2、KV、Turnstile、AI Gateway。
2. 将真实 D1 / KV ID 填入 `server/wrangler.jsonc`,并配置 `TURNSTILE_SITE_KEY` / `AI_GATEWAY_ID` / `ALTCHA_DEFAULT_DIFFICULTY`。
3. 写入线上 Worker Secrets:

```bash
pnpm -F server wrangler secret put JWT_SECRET
pnpm -F server wrangler secret put KEY_ENCRYPTION_KEY
pnpm -F server wrangler secret put TURNSTILE_SECRET_KEY
pnpm -F server wrangler secret put ALTCHA_HMAC_KEY
pnpm -F server wrangler secret put TENCENT_CAPTCHA_APP_SECRET_KEY
pnpm -F server wrangler secret put TENCENTCLOUD_SECRET_ID
pnpm -F server wrangler secret put TENCENTCLOUD_SECRET_KEY
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

- AI 助手入口：[AGENTS.md](./AGENTS.md)（Cursor / 通用）；Claude Code 见 [CLAUDE.md](./CLAUDE.md)
- 架构详解：[ARCHITECTURE.md](./ARCHITECTURE.md)
- API 文档页面：本地启动 Worker 后访问 `http://localhost:8787/api/docs`；OpenAPI 维护入口为 [`server/src/docs/openapi.ts`](./server/src/docs/openapi.ts)
- 完整索引：[docs/README.md](./docs/README.md)
