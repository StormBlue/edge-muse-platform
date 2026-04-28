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

发布前建议组合（与 [`ACCEPTANCE.md`](./ACCEPTANCE.md) 一致）：

```bash
pnpm -F server typecheck && pnpm -F web typecheck
pnpm -F server test
pnpm lint
pnpm -F web build && pnpm -F server build
```

## 范围

- **服务端**：单元/集成测试在 [`server/test/`](../server/test/)，覆盖 provider 协议形态、任务校验、回归场景（如 Cubence 相关 `cubenceRegression.test.ts`）。
- **前端**：[`web/src/stores/session.test.ts`](../web/src/stores/session.test.ts) 等；组件/组合函数测试使用 Vitest，涉及 Vue 组件渲染时使用 `@vue/test-utils`，需要 DOM 的用例在文件头声明 `// @vitest-environment happy-dom`。

## 限制

- **E2E**：尚未作为 CI 默认门槛；真实浏览器流程依赖后续 Playwright 等接入。
- **真实上游**：Cubence / 米醋等联网 smoke 需有效 API Key，不在默认 `pnpm test` 中执行。

## 相关文档

- [`ACCEPTANCE.md`](./ACCEPTANCE.md)
- [`OPERATIONS.md`](./OPERATIONS.md) — 手工 smoke 步骤
