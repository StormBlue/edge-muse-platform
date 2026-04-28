# AI 图像生成开发审核报告 06

审核日期：2026-04-28

审核范围：审核报告 05 修复后的当前变更集，重点复核 `/workspace` A 变体生成提交事件、失败重试归因继承、Prompt 助手参考图上下文 reset、sysadmin 实验指标口径，以及相关测试覆盖。

关联文档：[`./ai-image-generation-audit-01.md`](./ai-image-generation-audit-01.md)、[`./ai-image-generation-audit-02.md`](./ai-image-generation-audit-02.md)、[`./ai-image-generation-audit-03.md`](./ai-image-generation-audit-03.md)、[`./ai-image-generation-audit-04.md`](./ai-image-generation-audit-04.md)、[`./ai-image-generation-audit-05.md`](./ai-image-generation-audit-05.md)、[`../design-docs/ai-image-generation-page.md`](../design-docs/ai-image-generation-page.md)、[`../exec-plans/ai-image-generation-page-tasks.md`](../exec-plans/ai-image-generation-page-tasks.md)

## 结论

第五轮修复解决了审核 05 的主路径问题：`/workspace` 正常提交已经写入 `generate_submitted`，服务端终态事件可以闭环归因到 A 变体；失败重试会创建新的重试提交事件，并优先继承源任务的 variant、route 与 caseId；Prompt 助手已把参考图数量纳入上下文 reset key。定向测试、全量测试、类型检查、lint 和构建均通过。

但当前仍不建议直接用 sysadmin 页面现有 A/B 成功率、失败率或提交转化率做灰度扩量决策。核心原因不再是事件缺失，而是指标口径还不够可比：专业工作台 `/workspace` 支持 `chat` 连续对话，现有提交事件会把 `chat` 也计入 A 变体；同时失败重试虽然写了 `metadata.isRetry`，但 sysadmin 聚合接口和页面只按 `variant + eventName` 展示，仍看不到独立的“失败重试”指标。

## 验证结果

| 命令 / 检查                                                                                                              | 结果                                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `pnpm -F web test -- useWorkspaceActions.test.ts PromptAssistantPanel.test.ts AiImageGeneration.test.ts session.test.ts` | 通过：4 个测试文件 / 7 条测试。                                                   |
| `pnpm -F server test -- experiments.integration.test.ts experiments.test.ts`                                             | 通过：2 个测试文件 / 16 条测试。                                                  |
| `pnpm lint`                                                                                                              | 通过。                                                                            |
| `pnpm typecheck`                                                                                                         | 通过：server `tsc --noEmit`、web `vue-tsc --noEmit` 均完成。                      |
| `pnpm test`                                                                                                              | 通过：server 14 个测试文件 / 63 条测试，web 22 个测试文件 / 71 条测试。           |
| `pnpm build`                                                                                                             | 通过：前端 Vite 构建完成，Worker `wrangler deploy --dry-run --outdir dist` 完成。 |

说明：本轮变更集中在实验事件与助手状态生命周期，没有新增布局或视觉改动；响应式 Chrome 结论沿用审核 05 的 `/ai-image` 移动端、`/ai-image` PC `1280x600` 和 `/workspace` PC `1280x600` 复测结果。

## 关键缺陷

### P1：`/workspace` 的 `chat` 模式会混入 A 变体生成指标，A/B 口径仍不可比

位置：`web/src/views/workspace/useWorkspaceActions.ts` 99-118；`server/src/lib/experiments.ts` 340-355；`web/src/views/sysadmin/GenerationExperiment.vue` 197-228

第五轮修复让 `/workspace` 提交统一传入 `experimentEvent`，这是补齐 A 变体闭环的必要步骤。但 `/workspace` 不只是文生图/图生图入口，它还支持 `chat` 连续对话；`useWorkspaceActions.submit()` 当前对所有 `SessionMode` 都写 `generate_submitted`，metadata 中虽有 `mode`，但后端 `getGenerationExperimentMetrics()` 只按 `variant + eventName` 聚合，sysadmin 页面也只展示这三个字段。

真实风险：

- A 变体的 `generate_submitted` / `generate_succeeded` / `generate_failed` 会包含 `chat` 任务，B 变体 `/ai-image` 不存在 `chat` 模式。
- 如果 A 用户更常使用连续对话，A 的提交数和成功数会被额外放大；如果 chat 的失败率与图片生成不同，A/B 成功率会被模式结构污染。
- sysadmin 当前页面无法按 `mode` 过滤或分组，即使 metadata 已记录 `mode`，运营侧也看不到“仅文生图/图生图”的对比。

建议：

- 方案 A：前端只在 `/workspace` 的 `text2image` / `image2image` 模式写入 `generation_experience` 的生成提交事件，`chat` 另设独立事件或不进入本实验。
- 方案 B：后端指标接口按 metadata.mode 解析并提供 mode 维度，sysadmin 页面默认展示 `text2image + image2image`，把 `chat` 单独列出。
- 增加测试：`/workspace` chat 提交不应进入 AI 图像生成 A/B 漏斗，或应在指标中被单独分组。

### P2：失败重试仍没有独立聚合指标，sysadmin 页面看不到重试恢复效果

位置：`server/src/lib/experiments.ts` 246-303、340-355；`web/src/views/sysadmin/GenerationExperiment.vue` 197-228；`docs/design-docs/ai-image-generation-page.md` 253

第五轮已把重试任务写成带 `metadata.isRetry = true` 的 `generate_submitted`，并继承源任务归因。这个修复保证了重试任务不会丢失终态事件，但还没有实现设计文档中的“失败重试”指标展示。当前聚合接口只返回 `{ variant, eventName, count }`，不会按 `metadata.isRetry` 分组；sysadmin 页面也无法区分首次提交和重试提交。

真实风险：

- sysadmin 仍无法判断 A/B 哪个变体触发了更多重试。
- 无法计算“重试后成功率”，也不能评估失败后的体验恢复能力。
- 重试任务被计入普通 `generate_submitted`，会抬高提交数；如果用成功数 / 提交数做粗略成功率，会把首次任务和重试任务混在一起。

建议：

- 后端聚合层新增 retry 维度，至少提供 `generate_retry_submitted`、`generate_retry_succeeded`、`generate_retry_failed` 这样的派生指标。
- 或新增白名单事件 `failed_retry_clicked` / `generate_retry_submitted`，避免依赖 JSON metadata 做运营聚合。
- sysadmin 页面增加“首次任务”和“重试任务”分组，灰度发布决策默认使用首次任务口径。

### P3：Prompt 助手只按参考图数量 reset，替换同数量参考图仍会混用旧对话

位置：`web/src/views/ai-image/PromptAssistantPanel.vue` 56-65；`web/src/views/ai-image/AiImagePromptPanel.vue` 189-194

第五轮把 `referenceCount` 加入 `contextKey`，能覆盖“新增/删除参考图导致数量变化”的场景。但如果用户把 1 张参考图替换成另一张参考图，或者保持 2 张图但替换其中一张，`referenceCount` 不变，助手对话不会 reset。图生图对话通常强依赖参考图内容，旧对话继续参与下一轮请求会造成提示词方向错位。

建议：

- 给 `PromptAssistantPanel` 传入参考图上下文 key，例如文件名、大小、lastModified、上传后 imageId 的稳定摘要。
- `contextKey` 使用 `referenceContextKey` 而不是只使用数量。
- 增加组件测试：参考图数量不变但 reference key 变化时，messages/latest/input/loading 被重置，旧请求响应被丢弃。

## 正向确认

- `/workspace` 正常提交已传 `experimentEvent`，metadata 没有 prompt、参考图内容或密钥，符合当前脱敏策略。
- `recordRetrySubmittedExperimentEvent()` 会优先继承源任务提交快照，避免实验策略切换后把同一条重试旅程拆到另一个变体。
- 服务端结果事件仍以同 task 的 `generate_submitted` 为前提，避免产生无法归因的孤立终态事件。
- Prompt 助手参考图数量变化、案例变化、模式变化、provider 能力变化都能触发 reset，并通过组件测试覆盖。
- 全量 `lint`、`typecheck`、`test`、`build` 均通过。

## 建议修复顺序

1. 先修 A/B 指标口径：排除或单独聚合 `/workspace` 的 `chat` 模式，保证 A/B 默认比较只覆盖文生图和图生图。
2. 再补失败重试的独立指标：让 sysadmin 页面能看到首次任务和重试任务的提交、成功、失败。
3. 最后把参考图稳定摘要传给 Prompt 助手，覆盖“同数量替换参考图”的上下文 reset。

## 发布建议

当前功能主链路可以继续内部试用，但不建议把现有 sysadmin 指标作为普通用户灰度扩量依据。若必须小范围开放，建议只观察页面打开、案例选择、助手使用、普通提交量等基础行为；成功率、失败率、失败重试恢复率应等 P1/P2 指标口径修复后再进入发布决策。

## 修复状态

修复日期：2026-04-28

| 项目                                          | 状态   | 修复说明                                                                                                                                                                                    |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 `/workspace` 的 `chat` 模式混入 A 变体指标 | 已修复 | `/workspace` 正常提交时仅文生图、图生图写入 `generation_experience` 的 `experimentEvent`；服务端指标聚合也会把历史 chat 事件转为 `chat_generate_*` 派生指标，不进入默认 `generate_*` 漏斗。 |
| P2 失败重试没有独立聚合指标                   | 已修复 | sysadmin 指标聚合按 metadata 派生 `generate_retry_submitted`、`generate_retry_succeeded`、`generate_retry_failed`，默认 `generate_*` 漏斗只保留首次任务。                                   |
| P3 同数量替换参考图不 reset Prompt 助手       | 已修复 | `AiImagePromptPanel` 基于参考图文件名、类型、大小和 lastModified 生成 `referenceContextKey`，`PromptAssistantPanel` 使用该 key 作为上下文版本，同数量替换图片也会 reset。                   |

已补充测试：`server/test/experiments.integration.test.ts`、`web/src/views/workspace/useWorkspaceActions.test.ts`、`web/src/views/ai-image/PromptAssistantPanel.test.ts`。
