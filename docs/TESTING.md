# 测试

## 命令

```bash
pnpm test              # 全 workspace
pnpm -F server test    # 服务端 Vitest
pnpm -F web test       # 前端 Vitest
pnpm typecheck
pnpm lint
pnpm build
```

发布前执行与 CI 同范围的检查，任一步失败都应停止发布；类型检查通过不能替代测试：

```bash
pnpm install --frozen-lockfile
pnpm -F server types
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

请逐条确认退出码为 0，或在支持的 shell 使用 `&&` 连接。PowerShell 的 `;` 不会在前一步失败后停止，不能用于串联发布命令。

服务端入口 `server/scripts/run-vitest-batches.mjs` 自动发现 `server/test/` 顶层所有 `*.test.ts`，按文件名排序、单文件批次执行；新测试放入该目录即纳入 CI。Windows 批次间默认间隔 1 秒，其他平台为 0；可用 `VITEST_BATCH_DELAY_MS` 调整。默认 `VITEST_BATCH_RETRIES=0`，断言失败立即以非零状态退出；定位原生 worker 启动故障时才显式开启重试（间隔由 `VITEST_BATCH_RETRY_DELAY_MS` 控制）。空测试目录也必须报错。

米醋专项排查：

```bash
pnpm -F server exec vitest run test/provider.test.ts test/micuPolicy.test.ts test/tasksCreate.test.ts
```

专项检查不能取代发布前全量检查。覆盖三类模型及后缀的尺寸路由、计费边界、历史账本、重复退款、退款事务回滚、其他渠道与 sysadmin 隔离。mock 断言异常可能被请求层包装成 `PROVIDER_FETCH_ERROR`，并触发图生图 chat 回退；这不代表已调用真实上游或上游不可用。

## 范围

- **服务端**：单元/集成测试在 [`server/test/`](../server/test/)，覆盖 provider 协议形态、任务校验、回归场景（如 Cubence 相关 `cubenceRegression.test.ts`）、生成实验分配/事件/重试/指标（`experiments*.integration.test.ts`）。登录验证码覆盖见 `captcha.test.ts`，包含腾讯签名、Turnstile/配置回归、ALTCHA challenge、有效 proof、篡改和重放失败。
- **前端**：[`web/src/stores/session.test.ts`](../web/src/stores/session.test.ts) 等；组件/组合函数测试使用 Vitest，涉及 Vue 组件渲染时使用 `@vue/test-utils`，需要 DOM 的用例在文件头声明 `// @vitest-environment happy-dom`。

## 限制

- **E2E**：尚未作为 CI 默认门槛；真实浏览器流程依赖后续 Playwright 等接入。
- **真实上游**：Cubence / 米醋等联网 smoke 需有效 API Key，不在默认 `pnpm test` 中执行。

## 相关文档

- [`ACCEPTANCE.md`](./ACCEPTANCE.md)
- [`OPERATIONS.md`](./OPERATIONS.md) — 手工 smoke 步骤
