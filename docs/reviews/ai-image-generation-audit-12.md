# AI 图像生成开发审核报告 12

审核日期：2026-04-29

审核范围：根据原始需求 [`../design-docs/ai-image-generation-page.md`](../design-docs/ai-image-generation-page.md)、开发任务列表 [`../exec-plans/ai-image-generation-page-tasks.md`](../exec-plans/ai-image-generation-page-tasks.md)、上一轮审核 [`./ai-image-generation-audit-11.md`](./ai-image-generation-audit-11.md)，以及当前工作树实现，复核功能完整性、业务口径、代码缺陷、发布风险和源码文件规模。

## 结论

当前实现已经修复审核 11 中影响主流程和核心指标口径的主要问题：案例不再初始自动回填 prompt、AI 图像页失败可重试、助手回填带 `turnCount`、`assistant_started` 已提前到打开助手语义、AI 图像页提交事件带 `n`，sysadmin 漏斗摘要也补齐了曝光、助手启动、prompt 回填和 retry success 等字段。

本轮没有发现 P1 级阻断编译、构建或生成主链路的 bug。`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 均通过。

仍不建议直接扩大到普通用户大流量。剩余风险主要是：AI 助手“空白开始”仍会继承自动预览的第一个案例上下文，sysadmin 案例管理缺少需求中的批量操作，A/B 指标缺少“返回历史”事件，移动端助手没有按原始方案进入全屏对话，助手运行缺少显式 feature flag 和可聚合降级率指标。

## 验证说明

本轮执行了静态审查、需求对照、目标代码抽查和基础自动化验证。未执行真实 Workers AI 联调、真实 Cubence/米醋生图冒烟、生产 D1 迁移或浏览器视觉复测。

| 命令             | 结果                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| `pnpm lint`      | 通过。                                                                  |
| `pnpm typecheck` | 通过：server `tsc --noEmit`、web `vue-tsc --noEmit` 均通过。            |
| `pnpm test`      | 通过：server 14 个测试文件 / 75 条测试，web 24 个测试文件 / 83 条测试。 |
| `pnpm build`     | 通过：web Vite build 成功，server Wrangler dry-run build 成功。         |

额外核验：

- 首批案例种子文件存在，`server/scripts/prompt-cases.seed.json` 共 28 个案例，7 个分类各 4 个，数量符合 MVP 20-30 个要求。
- 审核 11 中疑似重复参数和重复字段不是当前真实代码问题，当前 `server/src/lib/experiments.ts` 与 `web/src/stores/session.ts` 语法状态正常。
- 当前源码文件规模检查覆盖 `server/src`、`server/test`、`web/src` 下的 `.ts` / `.vue` 文件。

## 已复核的审核 11 修复

| 审核 11 问题                               | 当前复核结论                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `assistant_prompt_filled` 缺少 `turnCount` | 已修复，`PromptAssistantPanel` 回填 emit 带 `turnCount`，事件 metadata 写入 `turnCount`。 |
| `assistant_started` 触发时机偏晚           | 已修复，打开/聚焦助手时触发并做本地去重。                                                 |
| AI 图像页失败任务没有重试入口              | 已修复，AI 页失败面板可调用 `/api/tasks/:id/retry` 并补 retry metadata。                  |
| 初始加载自动回填第一个案例 prompt          | 已修复为只预览，不再设置 `finalPromptSource = "case"`。                                   |
| `generate_submitted` 缺少 `n`              | 已修复，AI 页固定传 `n: 1`。                                                              |
| 图生图助手缺少参考图描述                   | 已修复，图生图区域新增参考图描述并纳入助手上下文 reset。                                  |
| sysadmin 漏斗摘要缺少曝光和 prompt 回填    | 已修复，摘要包含 `exposed`、`assistantStarted`、`promptFilled`、retry success 等。        |
| 实验 catalog/metrics 分类分散              | 已有改善，事件 catalog 与 metrics 聚合已拆出独立文件，但 `experiments.ts` 仍偏大。        |

## 关键缺陷

### P2：空白开始助手仍会继承自动预览案例上下文

位置：`web/src/views/ai-image/useAiImageCases.ts` 128-157；`web/src/views/ai-image/AiImageGeneration.vue` 274-296；`web/src/views/ai-image/PromptAssistantPanel.vue` 101-119

审核 11 修复后，初始加载不再自动把第一个案例 prompt 填入最终 prompt，这是正确的。但 `ensureAvailableSelection()` 仍会在没有用户主动选择案例时调用 `previewCase(available[0])`，使 `cases.selected.value` 指向第一个可用案例。外层随后把这个 `caseItem` 传给 `PromptAssistantPanel`，助手请求会携带该案例的 `caseTitle` 和 `casePromptTemplate`。

真实影响：

- 用户从空白开始打开 AI 助手时，助手实际受第一个案例影响，不是真正空白。
- `selectedCaseTitle` 会显示第一个案例名，容易让用户误以为当前空白 prompt 已绑定某案例。
- `assistant_started` / `assistant_prompt_filled` 的 `caseId` 可能记录自动预览案例，污染“案例辅助”和“自由 prompt”路径判断。

建议：

- 明确区分 `previewedCase`、`userSelectedCase`、`appliedCase`。
- 只有用户主动点击案例卡片或点击“使用案例 prompt”后，才把案例上下文传给助手和 telemetry。
- 初始自动预览只用于详情展示，不能参与助手请求和 case attribution。

### P3：sysadmin 案例管理缺少批量操作

位置：`web/src/views/sysadmin/PromptCases.vue` 118-126；`web/src/views/sysadmin/PromptCaseTable.vue` 11-21、115-157；`server/src/routes/sysadmin/promptCases.ts` 56-107

原始需求要求 `/sysadmin/prompt-cases` 支持批量发布、隐藏、归档、调整分类、设置精选。当前实现只有单行操作：编辑、精选切换、发布、隐藏、归档；后端也只有 create / patch / import，没有 bulk endpoint。

真实影响：

- 首批 20-30 个案例尚可手工处理，但后续增量导入后，发布前审核和上下线成本会快速上升。
- 批量导入默认 draft 是正确的，但缺少批量发布会让“导入 -> 人工审核 -> 批量发布”闭环不完整。
- 批量分类调整缺失时，分类体系变化只能逐条 patch，容易误操作。

建议：

- 表格增加多选列和选中计数。
- 后端新增 `POST /api/sysadmin/prompt-cases/bulk`，支持 `ids` + `patch`，并对状态、分类、精选做白名单校验。
- 批量操作写审计日志，payload 记录 ids 数量、目标状态/分类/精选，不记录完整 prompt。

### P3：A/B 核心指标缺少“返回历史”事件

位置：`docs/design-docs/ai-image-generation-page.md` 253；`server/src/lib/generationExperimentEvents.ts` 15-72；`web/src/api/experiments.ts` 40-46；`web/src/views/history/useHistoryController.ts` 152-155

需求的 sysadmin 核心指标明确包含“返回历史”。当前事件 catalog、客户端事件类型和 sysadmin 漏斗摘要都没有类似 `history_returned` / `return_history` 的事件；历史页 `backToGrid()` 只更新 query，不记录实验事件。

真实影响：

- 无法比较 A/B 两个入口生成后回到历史查看结果的行为差异。
- 如果 B 变体提升首次生成但降低历史回访，当前指标无法发现。
- 成功指标中的用户留存/结果复查路径需要额外人工查历史访问日志。

建议：

- 增加客户端事件，例如 `generation_history_returned`，metadata 至少包含 `fromRoute`、`variant`、`taskId/sessionId` 是否存在。
- 在 `/history` 进入会话详情、从生成页跳转历史、历史详情返回列表等路径中定义清晰口径，避免重复计数。
- sysadmin 摘要增加历史返回次数与 `historyReturnRate = historyReturned / submitted` 或 `/ succeeded`。

### P3：移动端 AI 助手没有按原始方案进入全屏对话

位置：`docs/design-docs/ai-image-generation-page.md` 82-87；`web/src/views/ai-image/AiImageGeneration.vue` 263-303；`web/src/views/ai-image/AiImagePromptPanel.vue` 209-219

原始移动端布局要求“AI 助手进入全屏对话，最终 prompt 确认后回到生成面板”。当前实现移动端仅把页面变成单列流式布局，助手仍嵌在 `AiImagePromptPanel` 内，不是全屏 dialog / route / sheet。

真实影响：

- 小屏上 prompt、参考图、助手聊天、最终 prompt、结果区堆在同一个滚动容器里，对话上下文容易丢失。
- 用户需要频繁上下滚动才能在参考图描述、助手追问和最终 prompt 之间切换。
- 视觉验收即使无溢出，也不等于满足原始交互形态。

建议：

- 移动端点击“打开助手”时进入全屏 dialog 或独立子路由。
- 全屏助手内保留聊天历史、输入框、最终 prompt 确认；确认后关闭并回填生成面板。
- 桌面端保留当前右侧内嵌面板。

### P3：`assistant_started` 去重粒度过粗，切换案例后会产生 case-level 指标错配

位置：`web/src/views/ai-image/AiImagePromptPanel.vue` 61-64、83-90、114-118；`web/src/views/ai-image/PromptAssistantPanel.vue` 85-87

当前 `assistantOpenTracked` 是页面级布尔值。助手自身会在 `caseItem`、mode、provider、参考图描述变化时 reset 对话，但外层的 `assistant_started` 不会随上下文 reset。用户先打开助手 A，切换到案例 B 后再次打开并回填，可能出现 `assistant_started.caseId = A`，`assistant_prompt_filled.caseId = B`。

真实影响：

- case-level 助手漏斗会错配，无法判断哪个案例真正促成助手使用。
- 切换模式或参考图后新的助手会话不计 started，`promptFillRate` 会偏高。
- 后续若按 case/category 分析助手效率，数据会不可信。

建议：

- 将去重 key 从布尔值改为 `caseId + mode + referenceContextKey`。
- 或由 `PromptAssistantPanel` 在 context reset 后 emit 一次新的 open key，外层按 key 去重。
- 测试覆盖“打开助手 -> 切换案例 -> 再次打开 -> started 重新记录”。

### P3：Prompt 助手缺少显式 feature flag 和可聚合降级率指标

位置：`docs/design-docs/ai-image-generation-page.md` 48、424；`server/src/routes/promptAssistant.ts` 24-35；`server/src/lib/promptAssistant.ts` 85-104

需求和风险缓解里提到 Prompt 助手需要 feature flag、日限额和失败降级。当前已经有 30 次/日限流和静态降级，但没有显式启停开关；Workers AI 失败、降级、模型调用量只通过 `console.info("prompt_assistant_turn")` 输出，没有进入 D1 指标或 sysadmin 可查看的聚合。

真实影响：

- 如果 Workers AI 成本、额度或输出质量在生产异常，运维只能通过关闭 binding/改部署绕路，不能在不发版的情况下关闭助手。
- 成功指标要求 Workers AI 降级率低于 2%，当前没有 sysadmin 页面或 D1 指标直接验证。
- A/B 扩量时无法快速判断 B 变体表现下降是否来自助手降级。

建议：

- 增加 `PROMPT_ASSISTANT_ENABLED` 或 sysadmin preference，关闭时前端隐藏助手入口，后端返回统一可控错误。
- 记录结构化助手指标：`assistant_turn_requested`、`assistant_turn_degraded`、`assistant_turn_failed`、latency、model。
- sysadmin 实验页或运维页展示助手降级率，至少按最近 24h / 7d 聚合。

### P3：首批案例种子有脚本但没有进入标准发布路径

位置：`server/scripts/prompt-cases.seed.json`；`server/scripts/seed-prompt-cases.mjs` 55-97；`server/package.json` 4-15

当前种子数据本身符合数量和分类要求，但 `seed-prompt-cases.mjs` 没有暴露在 `server/package.json` scripts，也没有在发布流程文档中形成标准步骤。只执行 `db:migrate:*` 不会得到已发布案例。

真实影响：

- 新环境如果遗漏种子脚本，`/ai-image` 会出现没有案例的首屏，普通用户入口价值明显下降。
- “案例启发 -> AI 问答写 prompt”主流程会退化成纯空白 prompt 页面。
- 远端首批案例是否发布依赖人工记忆，无法通过常规验收命令发现。

建议：

- 增加 `pnpm -F server prompt-cases:seed:local` / `prompt-cases:seed:remote`。
- 在 `docs/OPERATIONS.md` 或发布检查清单中写明迁移后执行首批案例 seed。
- seed 脚本执行后输出分类计数，并在验收中检查 `/api/prompt-cases` 非空。

## 代码与业务风险观察

- 实验事件 catalog 已比审核 11 前集中，但事件写入、归因、assignment、重试血缘仍在 `server/src/lib/experiments.ts` 内，后续新增事件仍容易让文件继续膨胀。
- `generationExperimentMetricsSummary.ts` 目前不展示 `generate_retry_failed`，但 raw metrics table 会显示该派生事件；若后续要分析重试失败率，摘要需要补一列。
- sysadmin 案例的“来源”筛选当前由前端 `filterBySource()` 完成，MVP 数据量可接受；如果案例量扩大或加分页，需要下沉到后端 query。
- 本轮未做浏览器视觉复测。由于移动端助手仍未全屏，建议修复后至少复测 `/ai-image` 的 390x844、1280x600、1920x1080 三个视口。

## 文件规模清单

当前最需要关注的源码文件如下：

| 文件                                                   | 行数 | 评估                                                                                |
| ------------------------------------------------------ | ---: | ----------------------------------------------------------------------------------- |
| `server/test/experiments.integration.test.ts`          |  803 | 过大，建议按 assignment、event recording、metrics、retry attribution 拆分测试文件。 |
| `server/src/lib/experiments.ts`                        |  733 | 过大，仍混合实验配置、分配、事件写入、归因、重试血缘和查询。                        |
| `server/src/lib/tasks/run.ts`                          |  545 | 偏大，可按 provider 调用、结果落库、状态推进、失败处理继续拆分。                    |
| `web/src/views/admin/useAdminUsersController.ts`       |  496 | 偏大，非本需求主线，但管理端用户控制器已超过常规 review 舒适区。                    |
| `server/src/routes/admin.ts`                           |  483 | 偏大，建议按 users / quota / password 等路由拆分。                                  |
| `web/src/views/admin/UserList.vue`                     |  475 | 偏大，表格、编辑弹层、筛选和动作可拆组件。                                          |
| `web/src/views/sysadmin/UserSessions.vue`              |  470 | 偏大，会话审计页仍是复杂单文件。                                                    |
| `web/src/views/sysadmin/Keys.vue`                      |  466 | 偏大，密钥表单、列表和删除/编辑逻辑可拆。                                           |
| `server/src/db/schema.ts`                              |  464 | schema 聚合文件偏大但可接受，继续增长时再考虑分域 schema。                          |
| `web/src/views/history/History.vue`                    |  442 | 偏大，历史列表、详情、过滤器可继续拆。                                              |
| `web/src/components/chat/ChatInput.vue`                |  421 | 偏大，上传、模式切换、输入提交可拆 composable/子组件。                              |
| `web/src/components/layout/AppShell.vue`               |  406 | 偏大，导航实验埋点、主题菜单、侧栏行为可拆。                                        |
| `web/src/views/workspace/useWorkspaceController.ts`    |  404 | 偏大，工作台控制器承担恢复、路由、滚动、provider 能力和提交状态。                   |
| `web/src/stores/session.ts`                            |  383 | 偏大，任务事件合并、生成提交、会话 CRUD 可继续分层。                                |
| `web/src/views/ai-image/AiImageGeneration.vue`         |  350 | 本需求主页面仍偏大，建议继续把案例上下文、telemetry 和提交事件构造下沉。            |
| `web/src/views/ai-image/useAiImageGenerationSubmit.ts` |  332 | 可接受但接近上限，失败重试、上传和 active result 查询可拆共享工具。                 |

## 建议修复顺序

1. 先修 P2：把自动预览案例从助手上下文与 case attribution 中隔离，保证“空白开始”真实可用。
2. 补 P3 指标缺口：增加“返回历史”事件，并修正 `assistant_started` context-level 去重。
3. 补 sysadmin 案例批量操作和案例 seed 标准发布脚本，避免内容运营链路卡在人工逐条处理。
4. 做移动端助手全屏交互，修复后重新执行浏览器视觉复测。
5. 增加 Prompt 助手 feature flag 和降级率指标，再进入普通用户扩量。
6. 后续维护任务继续拆 `server/src/lib/experiments.ts` 和 `server/test/experiments.integration.test.ts`，降低实验口径回归风险。
