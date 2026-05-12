# 安全模型

本文汇总线上需遵守的**实际控制**；实现以代码为准。

## 认证与会话

- **JWT**：访问/刷新令牌通过 **httpOnly Cookie** 传递；刷新轮换策略见 [`server/src/routes/auth.ts`](../server/src/routes/auth.ts)、[`server/src/lib/jwt.ts`](../server/src/lib/jwt.ts)。
- **登出黑名单**：刷新令牌可记入 KV 黑名单（[`server/src/lib/jwt.ts`](../server/src/lib/jwt.ts) 及相关路由）。
- **CSRF**：非 GET 请求校验 CSRF token（[`server/src/middleware/csrf.ts`](../server/src/middleware/csrf.ts)）。
- **登录防护**：地区化验证码 + 限流（[`server/src/lib/captcha/`](../server/src/lib/captcha)、[`server/src/middleware/rateLimit.ts`](../server/src/middleware/rateLimit.ts)）。默认中国大陆访问走腾讯云验证码，其他地区走 Turnstile；sysadmin 可分别切换为腾讯、Turnstile、ALTCHA 或禁用。`ENVIRONMENT=dev` 未保存系统设置时验证码默认禁用，保存后的 D1 配置可用于本地联调；生产环境校验失败关闭。
- **ALTCHA**：自托管 PoW provider 使用 `ALTCHA_HMAC_KEY` 签发 Widget v3 challenge；浏览器求解，Worker 登录校验只做常数次 HMAC/SHA-256 和一次 replay 消费，避免在 Cloudflare Worker 上消耗循环 CPU。生产环境 replay 消费走 Durable Object 原子写入，KV 仅作为本地/测试 fallback；payload、HMAC key 不入日志。

## 账号生命周期

- **无公开注册**：账号由 admin/sysadmin 人工创建；无「忘记密码」公开链路。
- **密码存储**：单向哈希（[`server/src/lib/password.ts`](../server/src/lib/password.ts)）。

## 密钥与上游 API

- **Provider API Key**：AES-GCM 加密存入 D1（[`server/src/lib/crypto.ts`](../server/src/lib/crypto.ts)），`KEY_ENCRYPTION_KEY` 来自 Worker Secret；API 响应仅返回 `keyHint`。
- **加密主密钥轮换**：若更换 `KEY_ENCRYPTION_KEY`，需计划性重加密（见 [`OPERATIONS.md`](./OPERATIONS.md)）。

## 资产与内容

- **R2**：桶私有；图片仅通过鉴权接口（如 `/api/i/:imageId`）在所有权/角色校验后读出（[`server/src/routes/images.ts`](../server/src/routes/images.ts)、[`server/src/lib/access.ts`](../server/src/lib/access.ts)）。
- **XSS**：用户内容作**文本**渲染，不使用 `v-html` 渲染不可信 HTML（见历史安全评审结论）。

## HTTP 安全头

[`server/src/middleware/security.ts`](../server/src/middleware/security.ts) — CSP、frame 限制、Referrer-Policy、Permissions-Policy 等。

## 审计

敏感写操作记 [`server/src/lib/audit.ts`](../server/src/lib/audit.ts)（具体事件类型以路由调用为准）。

## 残留风险与 TODO

<!-- TODO: 生产环境需确认腾讯云验证码、Turnstile、ALTCHA_HMAC_KEY、DNS、Wrangler secrets 与最小权限 API Token 已按环境落地。 -->
<!-- TODO: E2E 覆盖可随 Playwright 在 CI 稳定后扩展（当前以 Vitest 为主）。 -->

## 相关文档

- [`OPERATIONS.md`](./OPERATIONS.md) — 密钥轮换与审计日志实践
- [`API.md`](./API.md) — 对外边界
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — 信任边界与数据流

---

_合并自原 `SECURITY_REVIEW.md`（2026-04-26）中的已实施控制与残留风险条目。_
