# 文档归档

本目录存放**已不再作为日常维护入口**但仍具历史参考价值的长文档。

| 文件                                                                       | 说明                                                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [`开发需求.md`](./开发需求.md)                                             | v1.0 产品/技术 PRD（2026-04-25）；细节以当前代码与根目录 [`ARCHITECTURE.md`](../../ARCHITECTURE.md) 为准                             |
| [`开发任务清单.md`](./开发任务清单.md)                                     | 分阶段任务勾选清单；状态可能滞后于主线                                                                                               |
| [`CUBENCE_INTEGRATION_TASKS.md`](./CUBENCE_INTEGRATION_TASKS.md)           | Cubence gpt-image-2 接入全过程任务、风险与代码索引；文内部分 `docs/...` 路径为当时结构，现以仓库根 `ARCHITECTURE.md` 与 `docs/` 为准 |
| [`LARGE_FILE_REFACTOR_TASKS.md`](./LARGE_FILE_REFACTOR_TASKS.md)           | 超大文件拆分与可维护性任务（T1–T8 已全部完成）；行数复扫快照仅供历史对照                                                             |
| [`ai-image-generation-page-tasks.md`](./ai-image-generation-page-tasks.md) | AI 图像生成页全量任务书（AIG-\*）；工程已完成，生产灰度勾选见文内 AIG-042                                                            |
| [`exec-plans-api-docs-support/`](./exec-plans-api-docs-support/)           | OpenAPI + Scalar 文档页专题需求与任务（已交付）；日常维护见 `server/src/docs/openapi.ts`                                             |

## 执行计划归档

`ai-image-generation-page-tasks.md` 与 `exec-plans-api-docs-support/` 由 `docs/exec-plans/` 迁入，避免与「当前活跃计划」混淆。新增执行计划仍从 [`../exec-plans/README.md`](../exec-plans/README.md) 起笔，封板后迁入本目录并更新上表。

## 引用说明

代码注释中若仍写「见开发需求 §x」，指 **`docs/archive/开发需求.md`**。

外部资源：[`../references/gpt-image2工具.html`](../references/gpt-image2工具.html)（由归档 PRD 引用）。
