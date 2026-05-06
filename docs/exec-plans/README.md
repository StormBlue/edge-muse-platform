# 执行计划 / 技术债

本目录用于存放**进行中**、可追踪的开发任务清单与里程碑；发布前总验收见 [`../ACCEPTANCE.md`](../ACCEPTANCE.md)，模块质量摘要见 [`../QUALITY_SCORE.md`](../QUALITY_SCORE.md)。

## 当前状态

**暂无活跃的里程碑型执行计划**。最近完成的计划全文已归档：

| 归档内容                                         | 路径                                                                                                                                                                             | 说明                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| AI 图像生成页、案例库、Prompt 助手、生成入口实验 | [`../archive/ai-image-generation-page-tasks.md`](../archive/ai-image-generation-page-tasks.md) · 短链 [`ai-image-generation-page-tasks.md`](./ai-image-generation-page-tasks.md) | 工程交付已完成；未完成勾选项仅限 **AIG-042** 中与生产灰度/运维勾选相关的备忘  |
| API 文档（OpenAPI + Scalar）                     | [`../archive/exec-plans-api-docs-support/`](../archive/exec-plans-api-docs-support/)                                                                                             | 权威维护：`server/src/docs/openapi.ts`；入口见 [`../README.md`](../README.md) |

实验与运行时行为以 [`../EXPERIMENTS.md`](../EXPERIMENTS.md) 与代码为准。

## 维护约定

- 任务使用稳定 ID（例如 `AIG-021`），避免后续讨论引用漂移。
- 状态使用 `TODO`、`DOING`、`REVIEW`、`DONE`、`BLOCKED`、`DEFERRED`。
- 完成并封板后：将全文迁入 `docs/archive/`，在本目录保留**短链**说明（参考 `ai-image-generation-page-tasks.md`），并更新 [`../archive/README.md`](../archive/README.md)。
