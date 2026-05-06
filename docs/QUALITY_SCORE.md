# 质量评估

> 主观分级，便于排期；以「可测试性 + 文档锚点 + 已知债」为主，非正式审计结论。

| 域              | 等级   | 说明                                                                                                                                 |
| --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Provider 适配层 | **A-** | `openai_compatible` / `openai_images` 分轨；单元测试覆盖请求形态；真实上游 smoke 仍部分依赖人工                                      |
| 任务与配额      | **A-** | `lib/tasks.ts` 为稳定导出面，实现拆在 `lib/tasks/*`；session 归属与空 `sessionId` 已有回归测试；生成入口见 `generationEntry.test.ts` |
| 密钥解析与分配  | **B+** | `resolveProviderKey` 已取消全局 fallback；assignable key 校验分散在多条路由，需改功能时全文搜索调用点                                |
| 前端工作台      | **B+** | 能力驱动 UI 与 store 合并逻辑复杂；E2E 覆盖不足                                                                                      |
| 可观测性        | **B**  | 结构化日志较全；暂无独立 APM 仪表盘约定                                                                                              |
| 国际化          | **B**  | zh/en 基础具备；文案一致性依赖 CR 自觉                                                                                               |

## 已知技术债（摘录）

1. E2E 与 CI 浏览器稳定性未标准化。
2. Provider health 对 Cubence 仅保证鉴权级检查；share group 需人工 smoke（见 [`OPERATIONS.md`](./OPERATIONS.md)）。
3. 历史 PRD 已归档，长期以代码与 `docs/` 为准（[`archive/README.md`](./archive/README.md)）。

## 相关文档

- [`ACCEPTANCE.md`](./ACCEPTANCE.md)
- [`DESIGN.md`](./DESIGN.md)
- [`design-docs/index.md`](./design-docs/index.md)
- [`EXPERIMENTS.md`](./EXPERIMENTS.md)
