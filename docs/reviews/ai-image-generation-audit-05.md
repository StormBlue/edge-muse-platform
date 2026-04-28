# AI 图像生成开发审核报告 05

审核日期：2026-04-28

审核范围：审核报告 04 修复后的当前变更集，重点复核服务端任务结果事件、案例归因、AI 图像生成页结果作用域、Prompt 助手上下文、缩略图 fallback、`/workspace` 与 `/ai-image` 两个 A/B 变体的指标闭环，以及本机 Chrome 响应式验收。

关联文档：[`./ai-image-generation-audit-01.md`](./ai-image-generation-audit-01.md)、[`./ai-image-generation-audit-02.md`](./ai-image-generation-audit-02.md)、[`./ai-image-generation-audit-03.md`](./ai-image-generation-audit-03.md)、[`./ai-image-generation-audit-04.md`](./ai-image-generation-audit-04.md)、[`../design-docs/ai-image-generation-page.md`](../design-docs/ai-image-generation-page.md)、[`../exec-plans/ai-image-generation-page-tasks.md`](../exec-plans/ai-image-generation-page-tasks.md)

## 结论

第四轮修复的主线基本有效：AI 图像生成页的任务成功/失败事件已经改为服务端终态写入，前端 WebSocket 回调不再承担结果指标上报；自由 prompt 不再带普通案例 `caseId`；结果图区只展示当前 AI 图像页提交任务的附件；Prompt 助手会在案例、模式或 provider 上下文变化时 reset；案例缩略图加载失败会回退到占位图。

当前仍不建议直接用 A/B 成功率或转化率做灰度决策。新的核心问题是 `/workspace` 作为 A 变体仍未在调用 `/api/generate` 时带 `experimentEvent`，而服务端结果事件现在要求同 task 已有 `generate_submitted` 才写入。因此 A 变体的生成提交、成功、失败事件会缺失，B 变体 `/ai-image` 的漏斗是闭环的，A 变体漏斗不是闭环的。

发布判断：功能体验可以继续内部 sysadmin/admin 试用；面向普通用户扩大灰度前，必须先补齐 `/workspace` A 变体和失败重试链路的实验事件，否则 sysadmin 页看到的 A/B 指标不能代表真实转化。

## 验证结果

| 命令 / 检查                                                                                                                                    | 结果                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本地服务健康检查                                                                                                                               | 前端 `http://localhost:5173` 返回 200；API `http://localhost:8787/api/health` 返回 ok。                                                           |
| `pnpm -F web test -- AiImageGeneration.test.ts aiImageResultScope.test.ts PromptCaseThumbnail.test.ts useAiImageCases.test.ts session.test.ts` | 通过：5 个测试文件 / 14 条测试。                                                                                                                  |
| `pnpm -F server test -- experiments.integration.test.ts experiments.test.ts`                                                                   | 通过：2 个测试文件 / 15 条测试。                                                                                                                  |
| `pnpm lint`                                                                                                                                    | 通过。                                                                                                                                            |
| `pnpm typecheck`                                                                                                                               | 通过：server `tsc --noEmit`、web `vue-tsc --noEmit` 均完成。                                                                                      |
| `pnpm test`                                                                                                                                    | 通过：server 14 个测试文件 / 62 条测试，web 20 个测试文件 / 68 条测试。                                                                           |
| `pnpm build`                                                                                                                                   | 通过：前端 Vite 构建完成，Worker `wrangler deploy --dry-run --outdir dist` 完成。                                                                 |
| 本机 Chrome `/ai-image` 移动端 `390x844`                                                                                                       | 通过：无横向溢出，`brokenImageCount = 0`，首屏标题为“AI 图像生成”。截图：`test-artifacts/chrome-responsive/audit05-ai-image-mobile-390x844.png`。 |
| 本机 Chrome `/ai-image` PC `1280x600`                                                                                                          | 通过：无横向溢出，`brokenImageCount = 0`。截图：`test-artifacts/chrome-responsive/audit05-ai-image-pc-1280x600.png`。                             |
| 本机 Chrome `/workspace` PC `1280x600`                                                                                                         | 通过：无横向溢出，`brokenImageCount = 0`，首屏标题为“图像生成”。截图：`test-artifacts/chrome-responsive/audit05-workspace-pc-1280x600.png`。      |

说明：本轮 Chrome 重点复测移动端和最低 PC 视口 `1280x600`；审核 03 已覆盖 `1920x1080` 与 4K 视口，审核 05 未发现需要推翻该结论的新布局变更。

## 关键缺陷

### P1：A 变体 `/workspace` 缺少生成提交与任务结果事件，A/B 成功率不可用

位置：`web/src/views/workspace/useWorkspaceActions.ts` 99-107；`web/src/stores/session.ts` 210-228；`server/src/lib/experiments.ts` 227-229；`docs/design-docs/ai-image-generation-page.md` 237-279

第四轮把任务结果事件移到服务端后，`recordTaskResultExperimentEvent()` 会先查同一 `taskId` 的 `generate_submitted`。如果不存在提交事件，函数直接返回，避免旧任务产生孤立结果指标。这个策略对 `/ai-image` 是成立的，因为 AI 图像生成页会通过 `sessions.generate({ experimentEvent })` 让 `/api/generate` 同步写入 `generate_submitted`。

但专业工作台 `/workspace` 调用 `sessions.generate()` 时只传 `title`、`prompt`、`mode`、`size`、`n`、`referenceImageIds` 和 `referenceImages`，没有传 `experimentEvent`。设计文档明确 A 变体是 `/workspace`，并且核心指标包含 `generate_submitted`、`generate_succeeded`、`generate_failed`。当前实现会导致：

- A 变体用户真实提交了生成任务，但 sysadmin 指标里没有 A 变体 `generate_submitted`。
- A 变体任务成功或失败时，服务端结果事件因缺少提交快照被跳过。
- B 变体 `/ai-image` 有完整提交/成功/失败漏斗，A 变体只有曝光、打开等入口事件，A/B 成功率、失败率和提交转化率无法公平对比。

建议修复：

- `/workspace` 正常提交时传入 `experimentEvent: { route: "/workspace", metadata: { mode, size, n, referenceImageCount, promptSource: "user" } }`。
- 后端继续用服务端当前分配决定 variant，不信任前端传 variant；前端只传 route 和结构化上下文。
- 增加前端测试：专业工作台提交 payload 包含 `/workspace` 的 `experimentEvent`。
- 增加后端集成测试：A 变体任务有 `generate_submitted` 后，服务端终态能写入 A 变体 `generate_succeeded` / `generate_failed`。

### P2：失败重试任务没有实验事件，重试成功率与“失败重试”指标缺失

位置：`web/src/views/workspace/useWorkspaceActions.ts` 128-160；`server/src/routes/generate.ts` 231-256；`docs/design-docs/ai-image-generation-page.md` 253

设计文档要求 sysadmin 实验页查看“失败重试”指标。当前 `/tasks/:id/retry` 会基于失败任务的 `params` 创建新任务，并通过 `retryOf` 记录血缘，但不会写 `generate_submitted`，也不会继承源任务的实验归因。由于服务端结果事件要求先有提交事件，重试任务完成后同样不会写 `generate_succeeded` / `generate_failed`。

真实影响：

- 用户失败后点击重试，系统无法统计哪一个变体更容易触发重试，也无法统计重试后的成功率。
- 如果某个 provider 或某类案例在 B 变体中失败较多，单看首次失败率不够；重试是否能恢复体验也应进入灰度判断。
- 重试链路的任务血缘已存在于 `tasks.retryOf`，但没有进入实验事件，sysadmin 页无法利用。

建议修复：

- 重试创建任务后写入一次 `generate_submitted`，metadata 带 `retryOf`、`isRetry: true`、`mode`、`size`、`n`、`referenceImageCount`。
- route、caseId 和 variant 优先继承源任务的 `generate_submitted` 快照；没有快照时再按当前分配兜底，并标记 `attributionFallback`。
- 如果产品需要单独展示“失败重试点击数”，可新增白名单事件 `failed_retry_clicked`，或在重试提交事件中按 `metadata.isRetry` 聚合。

### P3：Prompt 助手上下文 reset 未覆盖参考图变化

位置：`web/src/views/ai-image/PromptAssistantPanel.vue` 56-64、111-115；`web/src/views/ai-image/AiImagePromptPanel.vue` 189-194

第四轮已在案例、模式、provider model 和 provider 尺寸能力变化时 reset 助手对话，但请求上下文里还包含 `referenceBrief`，它由 `props.referenceCount` 生成。当前 `contextKey` 没有包含 `referenceCount`。用户在图生图模式下先与助手围绕 1 张参考图对话，再粘贴或删除参考图，下一轮请求会把新的参考图数量和旧聊天历史一起发送。

影响较轻，但会影响图生图 prompt 的准确性：

- 助手可能继续沿用“单张参考图”的问题链路，却在请求里收到“多张参考图”的 brief。
- 用户删除参考图后，对话仍可能围绕已不存在的参考图继续追问。

建议修复：

- 将 `props.referenceCount` 加入 `contextKey`。
- 更稳妥的做法是向助手传入参考图 id 摘要或稳定 hash，并以该 hash 作为上下文版本。
- 增加组件测试：图生图对话中改变参考图数量后，messages、latest、loading 状态被清空，旧请求响应不会回填。

## 测试覆盖缺口

- `/workspace` 提交链路缺少 `experimentEvent` 的前端单测；这是本轮 P1 未被自动化发现的直接原因。
- `/tasks/:id/retry` 没有覆盖实验事件继承与结果事件闭环。
- `PromptAssistantPanel` 目前只有 locale 纯函数测试，没有组件级测试覆盖上下文 reset 和过期响应丢弃。

## 正向确认

- 服务端主成功/部分失败路径会在任务和消息终态落库后写入实验结果事件，再广播 WebSocket：`server/src/lib/tasks/run.ts` 484-507。
- 服务端异常失败路径会在失败状态、保留图片和配额退还处理后写入 `generate_failed`：`server/src/lib/tasks/failure.ts` 91-115。
- 崩溃恢复路径会在根据已持久化图片补终态后写入成功或失败事件：`server/src/lib/tasks/imageRecovery.ts` 109-133。
- AI 图像生成页提交归因已按 `finalPromptSource` 分流，只有案例回填才带普通 `caseId`：`web/src/views/ai-image/AiImageGeneration.vue` 118-137。
- AI 图像生成页结果图区已按当前 `activeTaskId` / `activeSessionId` 过滤，不再从全局消息中取最近图片：`web/src/views/ai-image/useAiImageGenerationSubmit.ts` 53-57、130-149；`web/src/views/ai-image/aiImageResultScope.ts` 13-27。
- 缩略图 fallback 已抽为 `PromptCaseThumbnail`，列表和详情可复用破图降级逻辑。
- 本机 Chrome 在移动端和最低 PC 视口下未复现横向溢出或破图。

## 建议修复顺序

1. 先补 `/workspace` 提交时的 `experimentEvent`，让 A 变体生成提交、成功、失败漏斗闭环。
2. 再补 `/tasks/:id/retry` 的实验事件继承或重试事件，完成“失败重试”指标。
3. 将参考图变化纳入 Prompt 助手上下文 reset，并补组件级测试。
4. 修复后重新执行 `pnpm -F web test -- session.test.ts AiImageGeneration.test.ts`、`pnpm -F server test -- experiments.integration.test.ts experiments.test.ts`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。

## 发布建议

当前状态适合继续内部试用和视觉体验打磨，不适合把 sysadmin 实验页的 A/B 成功率作为灰度扩量依据。若业务上必须继续小范围放量，只建议观察入口曝光、页面打开、助手使用、案例选择等不依赖 `/workspace` 生成闭环的事件；生成提交率、成功率、失败率和重试恢复率应等 P1/P2 修复后再用于决策。

## 修复状态

修复日期：2026-04-28

| 项目                                              | 状态   | 修复说明                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 A 变体 `/workspace` 缺少生成提交与任务结果事件 | 已修复 | `/workspace` 正常提交 `sessions.generate()` 时同步传入 `experimentEvent`，route 固定为 `/workspace`，metadata 只包含 mode、size、n、referenceImageCount、promptSource 等结构化字段；服务端终态事件可通过同 task 的 `generate_submitted` 闭环归因到 A 变体。 |
| P2 失败重试任务没有实验事件                       | 已修复 | `/tasks/:id/retry` 创建新任务后、启动任务前写入重试 `generate_submitted`；优先继承源任务提交快照的 variant、route 与 caseId，metadata 带 `isRetry`、`retryOf` 与生成参数摘要。                                                                              |
| P3 Prompt 助手上下文 reset 未覆盖参考图变化       | 已修复 | `PromptAssistantPanel` 将 `referenceCount` 纳入上下文 key，图生图参考图数量变化时自动 reset，避免旧对话混入新参考图上下文。                                                                                                                                 |

已补充测试：`web/src/views/workspace/useWorkspaceActions.test.ts`、`web/src/views/ai-image/PromptAssistantPanel.test.ts`、`server/test/experiments.integration.test.ts`。
