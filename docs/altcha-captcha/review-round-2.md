# Review Round 2 - 类型与静态分析

## 结论

通过。新增类型、OpenAPI schema、Vue custom element 类型和 ALTCHA i18n 声明均可通过静态检查。

## 验证命令

- `pnpm lint`
- `pnpm typecheck`
- `git diff --check`

## 检查点

- `captchaProviderSchema`、`CaptchaProvider`、`LoginCaptchaProof` 同步包含 `altcha`。
- sysadmin PATCH schema 对 `altchaDifficulty` 做 `10000..200000` 校验，并兼容旧客户端省略该字段。
- `web/src/views/auth/useLoginCaptcha.ts` 拆出 `captchaLoaders.ts` 后降到 400 行以下。
- OpenAPI 聚合文件拆出 `captchaSchemas.ts` 与 `contentSchemas.ts`，没有新增过长源码文件。
