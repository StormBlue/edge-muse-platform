# AI 图像生成开发审核报告 11

审核日期：2026-04-28

审核范围：根据原始需求 [`../design-docs/ai-image-generation-page.md`](../design-docs/ai-image-generation-page.md)、开发任务列表 [`../exec-plans/ai-image-generation-page-tasks.md`](../exec-plans/ai-image-generation-page-tasks.md)，以及最近几次提交后的当前实现，全面复核功能完整性、业务口径、代码缺陷和源码文件过大问题。

关联文档：[`./ai-image-generation-audit-01.md`](./ai-image-generation-audit-01.md)、[`./ai-image-generation-audit-02.md`](./ai-image-generation-audit-02.md)、[`./ai-image-generation-audit-03.md`](./ai-image-generation-audit-03.md)、[`./ai-image-generation-audit-04.md`](./ai-image-generation-audit-04.md)、[`./ai-image-generation-audit-05.md`](./ai-image-generation-audit-05.md)、[`./ai-image-generation-audit-06.md`](./ai-image-generation-audit-06.md)、[`./ai-image-generation-audit-07.md`](./ai-image-generation-audit-07.md)、[`./ai-image-generation-audit-08.md`](./ai-image-generation-audit-08.md)、[`./ai-image-generation-audit-09.md`](./ai-image-generation-audit-09.md)、[`./ai-image-generation-audit-10.md`](./ai-image-generation-audit-10.md)

## 结论

当前实现已经覆盖 AI 图像生成页、案例库、Prompt 助手、A/B 实验管理等主流程，但仍不建议直接进入普通用户扩量。阻断点集中在实验指标口径和 AI 图像页失败体验：助手埋点缺失 `turnCount`，`assistant_started` 触发语义偏离需求，AI 图像页失败任务没有复用现有重试策略，且初始加载会自动选中第一个案例并污染自由输入路径归因。

代码维护性方面，前几轮已经拆出部分组件和事件 catalog，但 `server/src/lib/experiments.ts` 仍然过大，且事件分类、direct access 排除、指标命名、route 归因仍分散在多个函数中。后续每新增一个实验事件，都有再次发生指标漂移的风险。

此外，sysadmin 指标摘要还没有完整覆盖需求中要求的曝光和 prompt 回填指标；图生图助手缺少用户输入的参考图描述；`generate_submitted` 的 AI 页事件字段与 workspace 不一致。

## 验证说明

本轮是静态审查和需求对照，没有修改业务实现，也没有重新执行完整浏览器视觉复测或真实 Workers AI 联调。

最近一次编译修复后的已知验证结果：

| 命令             | 结果                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| `pnpm lint`      | 通过。                                                                  |
| `pnpm typecheck` | 通过。                                                                  |
| `pnpm build`     | 通过。                                                                  |
| `pnpm test`      | 通过：server 14 个测试文件 / 74 条测试，web 23 个测试文件 / 79 条测试。 |

## 关键缺陷

### P2：Event taxonomy 仍分散在多个分类器中

位置：`server/src/lib/experiments.ts` 37-66；`server/src/lib/generationExperimentEvents.ts` 1-138

虽然已经抽出了 `generationExperimentEvents.ts`，但实验事件模型仍没有完全由单一 catalog 派生。当前协调点仍分散在 accepted event list、direct access 排除、metric naming helper、route-based attribution、task terminal source 过滤等逻辑中。上一轮 direct access 回归正是因为一个事件分类与另一个分类漂移。

真实影响：

- 新增事件时需要同步修改多个位置，漏改任何一处都会造成指标污染。
- direct access、retry、chat mode、task terminal source 等口径组合复杂，靠人工记忆维护风险较高。
- `server/src/lib/experiments.ts` 文件过大，进一步放大 review 漏洞。

建议：

- 让 catalog 成为事件事实来源，至少包含：是否允许客户端上报、是否参与主漏斗、是否排除 direct access、是否是 task terminal result、是否允许 retry 派生指标。
- validation、filtering、metric naming、direct access 排除均从 catalog 派生。
- 将 route attribution 与 metric aggregation 拆出独立模块，并用集成测试覆盖新增事件默认行为。

### P2：`assistant_prompt_filled` 缺少 `turnCount`

位置：`web/src/views/ai-image/useAiImageExperimentTracking.ts` 91-104；`web/src/views/ai-image/PromptAssistantPanel.vue` 139-145；`web/src/views/ai-image/AiImageGeneration.vue` 108-112

需求明确 `assistant_prompt_filled` 需要携带 `turnCount`、`caseId`、`promptLength`。当前构造事件只写 `promptLength` 和 `directAccess`，`PromptAssistantPanel` 回填 emit 也没有携带助手轮次数。

真实影响：

- 无法分析用户平均几轮后回填 prompt。
- 无法识别助手是否过早或过晚输出最终 prompt。
- 现有测试反而固化了缺失字段，后续修复必须同步更新测试。

建议：

- `PromptAssistantPanel` 在 `fillPrompt()` emit `{ prompt, recommendedSize, turnCount }`。
- `trackAssistantPromptFilled()` 接收并写入 `turnCount`。
- 前后端测试都补 `turnCount` 断言。

### P2：`assistant_started` 触发时机偏离需求

位置：`web/src/views/ai-image/PromptAssistantPanel.vue` 79-99；`web/src/views/ai-image/AiImagePromptPanel.vue` 110-134

需求定义 `assistant_started` 为“打开 AI 助手”。当前实现是在用户首次发送助手消息时才上报。打开助手后未输入或放弃的用户不会进入漏斗。

真实影响：

- `assistant_started -> assistant_prompt_filled` 转化率被虚高。
- 无法观察“打开助手但没有开始对话”的 UX 摩擦。
- 如果后续将助手作为 B 变体关键卖点，指标会低估入口阻力。

建议：

- 将 `assistant_started` 触发点移动到打开助手动作，例如点击 `openAssistant` 或首次滚动/聚焦助手面板。
- 使用本地状态去重，避免同一页面反复点击重复上报。
- 保留“首次发送消息”可作为单独事件，或作为 metadata 字段，不要混用 started 语义。

### P2：AI 图像页失败任务没有复用现有重试策略

位置：`web/src/views/ai-image/useAiImageGenerationSubmit.ts` 60-70；`web/src/views/ai-image/AiImagePromptPanel.vue` 249-280

AIG-003 验收要求失败任务沿用现有错误展示和重试策略。当前 AI 图像页收到 `task.failed` 只 toast，面板只展示成功图片，没有失败状态、失败原因和 retry 入口。

真实影响：

- B 变体失败后用户无法在当前页面直接重试。
- 失败重试指标会天然偏低，影响 A/B 实验判断。
- 与 `/workspace` 的失败体验不一致，违背“复用现有生成任务链路”的任务要求。

建议：

- 复用 workspace 的失败消息识别和 retry API，或抽出共享 `useGenerationRetry`。
- AI 图像页结果区展示失败状态、失败 prompt 和重试按钮。
- 重试事件 metadata 带 `retryTrigger: "ai-image"`、`directAccess`、原始 route/case context。

### P2：初始加载会自动选择并回填第一个案例

位置：`web/src/views/ai-image/useAiImageCases.ts` 128-145；`web/src/views/ai-image/AiImageGeneration.vue` 114-129

任务验收要求无案例选择或清空 prompt 后仍可直接输入 prompt 并进入 AI 助手。当前 `ensureAvailableSelection()` 在没有选中项时调用 `selectCase(available[0])`，会自动把第一个案例 prompt 写入，并将 `finalPromptSource` 标记为 `case`。

真实影响：

- 用户初次进入页面并未主动选择案例，但 prompt 已被某个案例占用。
- 自由输入路径不是真正空状态，`emptyGuide` 很难出现。
- 如果用户直接提交，生成会被错误归因为案例生成。

建议：

- 初始加载只设置 `selectedId` 用于详情预览，不要调用 `selectCase()` 回填 prompt。
- 明确区分 `previewedCase` 与 `appliedCase`。
- 只有用户点击案例卡片的“使用案例 prompt”或等价操作时才设置 `finalPromptSource = "case"`。

### P3：`generate_submitted` 缺少 `n` 指标字段

位置：`web/src/views/ai-image/useAiImageExperimentTracking.ts` 107-119；`web/src/views/ai-image/useAiImageGenerationSubmit.ts` 137-145

需求表要求 `generate_submitted` 记录 `mode`、`size`、`n`、`referenceImageCount`。workspace 入口已经写入 `n`，但 AI 图像页构造提交事件时只写 `mode`、`size`、`referenceImageCount` 和 `promptSource`。

真实影响：

- A/B 两个入口的提交事件字段不一致。
- 当前 AI 页固定 `n=1`，短期不影响计数，但会破坏统一分析和后续扩展。

建议：

- `AiImageSubmitExperimentInput` 增加 `n`。
- AI 页提交事件固定传 `n: 1`，并与 `/api/generate` body 保持一致。
- 测试补充 AI 页提交事件 metadata 包含 `n`。

### P3：图生图助手缺少用户参考图描述输入

位置：`web/src/views/ai-image/PromptAssistantPanel.vue` 101-122；`web/src/views/ai-image/AiImagePromptPanel.vue` 206-247

需求要求图生图助手只发送“用户输入的参考图描述与数量”，不上传二进制图片。当前 UI 只有参考图上传和数量，传给助手的 `referenceBrief` 是本地化的数量文案，没有让用户描述参考图角色、主体、构图、品牌或不可变项。

真实影响：

- 助手无法可靠判断参考图里哪些元素必须保持。
- 图生图最终 prompt 容易忽略身份、产品形状、Logo、构图、颜色等关键约束。
- 与需求中的图生图追问设计不完整匹配。

建议：

- 在图生图模式下增加参考图描述输入框。
- `referenceBrief` 拼接用户描述和数量，而不是只传数量。
- 助手上下文重置 key 应包含参考图描述变更。

### P3：sysadmin 漏斗摘要缺少曝光和 prompt 回填

位置：`web/src/views/sysadmin/generationExperimentMetricsSummary.ts` 21-49；`web/src/views/sysadmin/GenerationExperimentMetricsPanel.vue` 24-74

AIG-033 要求展示曝光、打开、prompt 回填、提交、成功、失败指标。当前摘要只聚合 `opened`、`submitted`、`succeeded`、`failed`、retry 和 direct access；`generation_entry_exposed` 与 `assistant_prompt_filled` 只能在原始指标表中查找。

真实影响：

- sysadmin 无法直接看到完整核心漏斗。
- 入口曝光到打开、助手启动到 prompt 回填等关键转化无法快速判断。
- 灰度扩量时需要人工从 raw metrics 中推导，容易误判。

建议：

- 摘要行增加 `exposed`、`promptFilled`，必要时增加 `assistantStarted`。
- 展示 `openRate = opened / exposed`、`promptFillRate = promptFilled / assistantStarted` 或 `promptFilled / opened`。
- 保留 raw metrics，但不要把 raw table 当核心指标替代品。

### P3：AI image page 已越过维护阈值

位置：`web/src/views/ai-image/AiImageGeneration.vue` 45-148

该页面仍承担案例选择、prompt 同步、尺寸 fallback、实验 telemetry、submit payload 构造和移动端 sheet 行为。虽然部分逻辑已拆到 composable，但 `directAccess` 和事件 payload 仍在页面与子组件之间手动传递。

真实影响：

- 新增 UI 事件时容易漏带 `directAccess` 或 case context。
- 页面组件修改面过大，review 时很难聚焦实际行为变化。
- 指标修复逻辑容易散落到多个 inline payload。

建议：

- 将 AI 页实验事件封装成更高层 composable，例如 `useAiImageTelemetry()`。
- 页面只调用语义方法：`trackCaseSelected()`、`trackAssistantOpened()`、`trackAssistantFilled()`、`buildGenerateSubmitted()`.
- 子组件只 emit 行为语义，不直接关心实验 metadata。

### P3：Sysadmin experiment screen 曾过大，仍需保持拆分边界

位置：`web/src/views/sysadmin/GenerationExperiment.vue` 30-64

该组件之前达到 442 行，混合数据加载、表单状态、preset/risk、漏斗摘要、raw metrics 和手动 assignment CRUD。当前工作树已经拆出 config、metrics、assignments panel 和 admin composable，主组件规模明显下降。

复核结论：

- 这项问题在当前工作树中已基本缓解。
- 后续需要避免把新增指标列、preset 逻辑或 assignment 行为重新塞回 `GenerationExperiment.vue`。
- 新增功能应继续落在 `GenerationExperimentConfigPanel.vue`、`GenerationExperimentMetricsPanel.vue`、`GenerationExperimentAssignmentsPanel.vue` 或 `useGenerationExperimentAdmin.ts` 的对应边界内。

### P3：实验领域文件仍然过大

位置：`server/src/lib/experiments.ts` 1-37

`server/src/lib/experiments.ts` 仍有 805 行，混合实验配置、assignment、事件写入、归因、重试血缘、指标窗口、指标过滤和 DB 查询。

真实影响：

- routine change 需要同时理解多个领域。
- 指标相关 bug 很容易在重构时回归。
- 测试文件 `server/test/experiments.integration.test.ts` 也达到 803 行，审查成本同步上升。

建议：

- 拆出 `experimentAssignments.ts`：分配、手动覆盖、paused 行为。
- 拆出 `experimentEventRecording.ts`：事件写入、归因、metadata sanitize。
- 拆出 `experimentMetrics.ts`：窗口、聚合、direct access/retry/chat 过滤。
- 集成测试按 assignment、event recording、metrics 三个文件拆分。

## 文件规模清单

本轮额外检查了源码文件过大过长问题。当前最需要关注的文件如下：

| 文件                                             | 行数 | 评估                                                               |
| ------------------------------------------------ | ---: | ------------------------------------------------------------------ |
| `server/src/lib/experiments.ts`                  |  805 | 过大，仍是实验指标回归高风险点。                                   |
| `server/test/experiments.integration.test.ts`    |  803 | 过大，建议按 assignment / recording / metrics 拆分。               |
| `server/src/lib/tasks/run.ts`                    |  545 | 偏大，可在后续任务中按 provider 执行、状态推进、结果落库拆分。     |
| `web/src/views/admin/useAdminUsersController.ts` |  496 | 偏大，非本需求主线，但已超过安全 review 阈值。                     |
| `server/src/routes/admin.ts`                     |  483 | 偏大，建议后续按 users / quota / password 等路由拆分。             |
| `web/src/views/sysadmin/UserSessions.vue`        |  470 | 偏大，建议继续拆 detail/header/table。                             |
| `web/src/views/sysadmin/Keys.vue`                |  466 | 偏大，密钥表单和列表可拆分。                                       |
| `server/src/db/schema.ts`                        |  464 | schema 聚合文件偏大但可接受，除非继续快速增长。                    |
| `web/src/views/history/History.vue`              |  442 | 偏大，可拆列表、详情、过滤器。                                     |
| `web/src/components/chat/ChatInput.vue`          |  421 | 偏大，上传、输入、模式切换逻辑可拆。                               |
| `web/src/views/ai-image/AiImageGeneration.vue`   |  311 | 已接近页面组件维护阈值，建议继续把 telemetry 和选中/预览语义下沉。 |
| `web/src/views/ai-image/AiImagePromptPanel.vue`  |  282 | 当前可接受，但加入失败重试和参考图描述后应同步拆分。               |

## 建议修复顺序

1. 先修 P2 指标口径：`assistant_started` 触发时机、`assistant_prompt_filled.turnCount`、初始自动回填案例。
2. 再补 AI 图像页失败重试，确保 B 变体失败体验和 retry 指标可用。
3. 补齐 `generate_submitted.n`、图生图参考描述、sysadmin 漏斗摘要字段。
4. 继续拆 `server/src/lib/experiments.ts` 和 `server/test/experiments.integration.test.ts`，把事件 catalog 真正变成单一事实来源。
5. 修复后重新执行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`，并至少做一次 `/ai-image` 移动端和桌面端浏览器复测。
