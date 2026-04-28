# AI 图像生成开发审核报告 07

审核日期：2026-04-28

审核范围：审核报告 06 修复后的当前变更集，重点复核生成实验事件的客户端/服务端边界、任务终态指标可信度、sysadmin 指标聚合口径，以及前几轮缺陷是否回归。

关联文档：[`./ai-image-generation-audit-01.md`](./ai-image-generation-audit-01.md)、[`./ai-image-generation-audit-02.md`](./ai-image-generation-audit-02.md)、[`./ai-image-generation-audit-03.md`](./ai-image-generation-audit-03.md)、[`./ai-image-generation-audit-04.md`](./ai-image-generation-audit-04.md)、[`./ai-image-generation-audit-05.md`](./ai-image-generation-audit-05.md)、[`./ai-image-generation-audit-06.md`](./ai-image-generation-audit-06.md)、[`../design-docs/ai-image-generation-page.md`](../design-docs/ai-image-generation-page.md)、[`../exec-plans/ai-image-generation-page-tasks.md`](../exec-plans/ai-image-generation-page-tasks.md)

## 结论

第六轮修复有效解决了审核 06 的核心口径问题：`/workspace` 的 chat 正常提交不再进入默认生成漏斗，失败重试已独立派生 `generate_retry_*` 指标，同数量替换参考图也会 reset Prompt 助手上下文。审核 04 中的自由 prompt 案例归因、结果图作用域、助手上下文 reset 和缩略图 fallback 也未见回归。

当前仍不建议把 sysadmin 的生成成功率、失败率、重试成功率作为灰度扩量依据。主要风险已经从前端离线漏报，转为“任务生命周期事件的写入边界还没有完全收紧”：公开 `/api/experiments/events` 仍能写入 `generate_submitted`、`generate_succeeded`、`generate_failed`，而服务端终态事件又按 `taskId + eventName` 去重，异常客户端或旧前端可以提前占位并污染服务端真实结果。

## 验证结果

| 命令 / 检查                                                                                                              | 结果                                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `pnpm -F server test -- experiments.integration.test.ts experiments.test.ts`                                             | 通过：2 个测试文件 / 18 条测试。                                                  |
| `pnpm -F web test -- useWorkspaceActions.test.ts PromptAssistantPanel.test.ts AiImageGeneration.test.ts session.test.ts` | 通过：4 个测试文件 / 9 条测试。                                                   |
| `pnpm lint`                                                                                                              | 通过。                                                                            |
| `pnpm typecheck`                                                                                                         | 通过：server `tsc --noEmit`、web `vue-tsc --noEmit` 均完成。                      |
| `pnpm test`                                                                                                              | 通过：server 14 个测试文件 / 65 条测试，web 22 个测试文件 / 73 条测试。           |
| `pnpm build`                                                                                                             | 通过：前端 Vite 构建完成，Worker `wrangler deploy --dry-run --outdir dist` 完成。 |

说明：本轮审核集中在事件边界、指标可信度和代码逻辑，未新增页面布局改动；响应式视觉结论沿用审核 05 的本机 Chrome 复测结果。

## 关键缺陷

### P1：任务生命周期实验事件仍暴露在公开采集入口，服务端真实终态可被提前占位

位置：`server/src/routes/experiments.ts` 15-26；`server/src/lib/experiments.ts` 30-48、186-249、374-388；`web/src/api/experiments.ts` 45-55

审核 04 已把任务成功/失败事件迁到服务端任务终态路径，这是正确方向。但当前公开认证接口 `POST /api/experiments/events` 仍使用完整 `experimentEventSchema`，其中包含 `generate_submitted`、`generate_succeeded`、`generate_failed`。这意味着普通登录用户、旧前端代码或异常客户端仍可以直接写任务生命周期事件。

真实风险：

- `generate_submitted` 可以脱离真实 `/api/generate` 任务被伪造，直接污染提交量。
- 用户拿到真实 taskId 后，可以在任务完成前主动 POST `generate_succeeded` 或 `generate_failed`。
- `recordTaskResultExperimentEvent()` 最终调用 `recordExperimentEvent()`，而 `recordExperimentEvent()` 会在发现同一 `userId + taskId + eventName` 已存在时直接 return；因此客户端提前写入的终态事件会阻止后续服务端真实结果写入。
- 成功/失败指标会重新变成“先写入者可信”，而不是“任务表和服务端执行结果可信”。这会影响 A/B 成功率、失败率和重试恢复率，属于灰度决策前必须修的口径漏洞。

建议：

- 拆分事件 schema：公开 `/experiments/events` 只允许 UX 行为事件，例如 `generation_entry_exposed`、`generation_page_opened`、`prompt_case_selected`、`assistant_started`、`assistant_prompt_filled`、`variant_switched_directly`。
- `generate_submitted` 只能由 `/api/generate` 和 `/tasks/:id/retry` 服务端路径写入；`generate_succeeded`、`generate_failed` 只能由任务执行、失败处理、恢复扫描等服务端终态路径写入。
- 服务端终态去重应只信任 `metadata.resultEventSource === "server_task_terminal"` 的既有事件；如果已存在非服务端来源终态事件，应覆盖、忽略或在指标聚合时剔除。
- 增加测试：公开事件接口拒绝 `generate_submitted`、`generate_succeeded`、`generate_failed`；旧客户端尝试提前写终态后，服务端真实终态仍能落库并进入指标。

### P2：sysadmin 指标聚合无界扫描全部实验事件，数据量上来后容易触发 Worker CPU/内存风险

位置：`server/src/lib/experiments.ts` 415-438

审核 06 为了解决 chat 和 retry 的派生口径，把 `getGenerationExperimentMetrics()` 改为查询所有非 sysadmin 事件，再在 Worker 中逐行解析 metadata 并用 JS Map 聚合。这在当前测试数据下能工作，但随着曝光、页面打开、案例选择、助手使用和生成事件持续积累，sysadmin 每次打开实验页都会读取全部历史事件并逐条 JSON parse。

真实风险：

- 指标页响应时间会随 `experiment_events` 总量线性增长。
- Worker 有 CPU 时间和内存限制，大量历史事件可能让 sysadmin 页面超时或失败。
- 后续若开启 25% 或更高流量灰度，曝光和页面打开事件会远多于生成事件，聚合成本会先于业务量膨胀。

建议：

- 指标接口增加默认时间窗口，例如最近 7 天或 30 天，并在 UI 上明确当前窗口。
- 在写入时保存可聚合字段，例如 `metricEventName`、`mode`、`isRetry`，让常用指标走 SQL `GROUP BY`。
- 或新增日级 rollup 表，由写入路径或定时任务累加，sysadmin 页面读取聚合表。
- 增加包含大量实验事件的性能/边界测试，至少覆盖“非生成事件很多、生成事件很少”的真实灰度形态。

### P3：前端事件 API 类型仍是任意字符串，无法在编译期阻止生命周期事件误用

位置：`web/src/api/experiments.ts` 45-55；`web/src/components/layout/generationExperimentEvents.ts` 13-17

前端 `trackExperimentEvent()` 的 `eventName` 类型仍是 `string`，入口事件 draft 也是 `string`。虽然后端 Zod 会拒绝未知事件名，但它不会阻止未来前端代码误把 `generate_submitted`、`generate_succeeded`、`generate_failed` 继续走公开事件接口；这也是 P1 能反复回来的类型层原因。

建议：

- 在前端定义 `ClientGenerationExperimentEventName`，只包含允许由浏览器主动上报的 UX 事件。
- `trackExperimentEvent()` 与 `GenerationExperimentEventDraft` 都使用该窄类型。
- 任务生命周期事件不要暴露给 `trackExperimentEvent()`；提交事件只通过 `sessions.generate()` 的 `experimentEvent` 参数随 `/api/generate` 服务端落库。
- 增加类型级或单元测试，确保客户端事件白名单不包含 `generate_*` 生命周期事件。

## 正向确认

- `/workspace` 正常提交已排除 `chat` 模式，文生图和图生图仍会随 `/api/generate` 写服务端提交事件。
- 服务端任务成功、失败、恢复扫描都已调用 `recordTaskResultExperimentEvent()`，前端关页、刷新或断网不会再直接导致终态事件漏报。
- `AiImageGeneration.vue` 只在 `finalPromptSource === "case"` 时写 `caseId`，自由输入和助手回填不会再污染案例转化数据。
- `useAiImageGenerationSubmit.ts` 的结果图展示已通过 `activeTaskId` / `activeSessionId` 限定，不再从全局消息里取最近历史图。
- `PromptAssistantPanel.vue` 的上下文 key 已包含案例、模式、provider 能力和参考图稳定 key，旧对话不会跨上下文混用。
- `PromptCaseThumbnail.vue` 已统一处理缩略图加载失败，案例卡片不会显示浏览器破图。
- 定向测试、全量测试、类型检查、lint 和构建均通过。

## 建议修复顺序

1. 先修 P1：拆分公开客户端事件与服务端任务生命周期事件，公开接口拒绝 `generate_*` 任务事件，并处理历史/异常客户端提前写入的终态事件。
2. 同步修 P3：收窄前端 `trackExperimentEvent()` 类型，避免后续开发再次误用公开事件入口。
3. 再修 P2：为 sysadmin 指标增加时间窗口或写入期派生字段，避免灰度数据量扩大后页面不可用。
4. 修复后重新运行本报告中的定向测试、全量 `lint/typecheck/test/build`，并补充至少一条“客户端提前写终态不影响服务端真实终态”的集成测试。

## 发布建议

功能主链路可以继续内部试用；但在 P1 修复前，不应使用当前成功率、失败率、重试成功率做普通用户灰度扩量或模型/入口优劣判断。若需要继续试用，建议只观察页面打开、案例选择、助手使用和真实生成可用性；所有任务结果类指标应等生命周期事件边界收紧后再纳入发布决策。

## 修复状态

修复日期：2026-04-28

| 项目                                | 状态   | 修复说明                                                                                                                                                                                                                                                      |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 公开采集入口可写任务生命周期事件 | 已修复 | 新增客户端事件白名单 schema，`POST /api/experiments/events` 只允许曝光、页面打开、案例选择、助手和入口切换事件；`generate_submitted` 只由 `/api/generate` / 重试服务端路径写入，`generate_succeeded` / `generate_failed` 只信任 `server_task_terminal` 来源。 |
| P2 sysadmin 指标聚合无界扫描        | 已修复 | 指标查询默认限制最近 30 天，并在 sysadmin 页面展示当前统计窗口；终态指标聚合会剔除非服务端来源的历史/异常结果事件。                                                                                                                                           |
| P3 前端事件 API 类型过宽            | 已修复 | `trackExperimentEvent()` 改为 `ClientExperimentEventName` 窄类型，布局入口事件 draft 同步收窄，编译期不再允许浏览器主动上报 `generate_*` 生命周期事件。                                                                                                       |

已补充测试：`server/test/experiments.test.ts` 覆盖客户端事件白名单；`server/test/experiments.integration.test.ts` 覆盖旧客户端终态占位不影响服务端真实终态、指标窗口过滤和服务端终态指标口径。
