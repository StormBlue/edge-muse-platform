# Review Round 1 - 功能完整性

## 结论

通过。ALTCHA 已作为第四个登录验证码 provider 接入，国内/国外 provider 均可配置为 `altcha`，sysadmin 可配置 challenge 难度。

## 检查点

- `/api/config` 在 provider 为 `altcha` 时返回 `challengeUrl`。
- `GET /api/captcha/altcha/challenge` 公开签发 signed challenge。
- `POST /api/auth/login` 接受 `{ provider: "altcha", payload }`。
- 登录页按 provider 渲染 ALTCHA Widget v3，verified 后提交 payload。
- sysadmin preferences GET/PATCH 返回并保存 `captcha.altchaDifficulty`。

## 剩余风险

本地真实浏览器 smoke 因 Wrangler 远程连接在当前网络下失败，未完成；已由 build、类型检查和服务端核心测试覆盖主要路径。
