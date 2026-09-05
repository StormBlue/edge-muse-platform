# 质量评估

> 主观分级，便于排期；以「可测试性 + 文档锚点 + 已知债」为主，非正式审计结论。

| 域              | 等级   | 说明                                                                                                                                                                                                                                |
| --------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider 适配层 | **A-** | `openai_compatible` / `openai_images` 分轨；单元测试覆盖请求形态；真实上游 smoke 仍部分依赖人工                                                                                                                                     |
| 任务与配额      | **A-** | 管线实现位于 `lib/tasks/*`；取消退款原子性、竞态、本人列表与来源权限见 [`apiPermissions.test.ts`](../server/test/apiPermissions.test.ts)，生成入口见 `generationEntry.test.ts`                                                      |
| 密钥解析与分配  | **B+** | `resolveProviderKey` 已取消全局 fallback；assignable key 校验分散在多条路由，需改功能时全文搜索调用点                                                                                                                               |
| 前端创作        | **B+** | AI 创作器独立于工作台会话状态；路由/账号竞态与复用见 [`useImageStudio.test.ts`](../web/src/views/ai-image/useImageStudio.test.ts)，任务观察见 [`taskActivity.test.ts`](../web/src/stores/taskActivity.test.ts)；持续 E2E 覆盖仍不足 |
| 可观测性        | **B**  | 结构化日志较全；暂无独立 APM 仪表盘约定                                                                                                                                                                                             |
| 国际化          | **B**  | zh/en 基础具备；文案一致性依赖 CR 自觉                                                                                                                                                                                              |

## 已知技术债（摘录）

1. E2E 与 CI 浏览器稳定性未标准化。
2. Provider health 对 Cubence 仅保证鉴权级检查；share group 需人工 smoke（见 [`OPERATIONS.md`](./OPERATIONS.md)）。
3. 历史 PRD 已归档，长期以代码与 `docs/` 为准（[`archive/README.md`](./archive/README.md)）。

## 相关文档

- [`ACCEPTANCE.md`](./ACCEPTANCE.md)
- [`DESIGN.md`](./DESIGN.md)
- [`design-docs/index.md`](./design-docs/index.md)
- [`EXPERIMENTS.md`](./EXPERIMENTS.md)
