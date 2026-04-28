# 执行计划 / 技术债

本目录用于存放可追踪的开发任务清单、里程碑和技术债分解；发布前总验收见 [`../ACCEPTANCE.md`](../ACCEPTANCE.md)，模块质量摘要见 [`../QUALITY_SCORE.md`](../QUALITY_SCORE.md)。

## 活跃计划

| 计划                                                                       | 用途                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`ai-image-generation-page-tasks.md`](./ai-image-generation-page-tasks.md) | AI 图像生成独立页面、案例管理、提示词助手、A/B 测试管理的分层级任务清单 |

与本计划配套的 **已实现** 实验后端（路由、分配、指标、sysadmin API）参见 [`../EXPERIMENTS.md`](../EXPERIMENTS.md)。

## 维护约定

- 任务使用稳定 ID，例如 `AIG-021`，避免后续讨论时引用漂移。
- 状态使用 `TODO`、`DOING`、`REVIEW`、`DONE`、`BLOCKED`、`DEFERRED`。
- 完成任务时同步填写验收证据，例如测试命令、截图、PR 或提交号。
