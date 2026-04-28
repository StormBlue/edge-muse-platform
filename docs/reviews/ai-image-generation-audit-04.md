# AI 图像生成开发审核报告 04

审核日期：2026-04-28

审核范围：审核报告 03 修复后的当前变更集，重点复核任务结果事件可靠性、案例归因、AI 图像生成页状态隔离、Prompt 助手上下文、真实 Chrome 响应式验收与测试覆盖。

关联文档：[`./ai-image-generation-audit-01.md`](./ai-image-generation-audit-01.md)、[`./ai-image-generation-audit-02.md`](./ai-image-generation-audit-02.md)、[`./ai-image-generation-audit-03.md`](./ai-image-generation-audit-03.md)、[`../exec-plans/ai-image-generation-page-tasks.md`](../exec-plans/ai-image-generation-page-tasks.md)

## 结论

第三轮修复后的代码质量比前两轮明显收敛：提交事件已改为 `/api/generate` 服务端写入，provider 能力收缩、推荐尺寸降级、无可用案例时 prompt 来源等问题已有测试覆盖；真实 Chrome 在移动端和 `1280x600` 视口下仍未发现整体横向溢出。

但第四轮仍不建议直接扩大到普通用户灰度。核心残余风险集中在“指标可信度”和“页面状态隔离”：任务成功/失败事件仍依赖前端 WebSocket 回调，用户关页或断线会漏记结果；用户清空案例 prompt 后自由输入，提交仍带当前案例 `caseId` 和案例标题，会污染案例转化与历史会话；结果图面板会从全局 session store 里取最近一条有附件的消息，可能展示旧会话图片。

## 验证结果

| 命令 / 检查                                                                                                                                         | 结果                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm -F web test -- AiImageGeneration.test.ts useAiImageCases.test.ts aiImageSizeFallback.test.ts aiImageSubmitValidation.test.ts session.test.ts` | 通过：5 个测试文件 / 15 条测试。                                                                                                                                  |
| `pnpm -F server test -- experiments.integration.test.ts experiments.test.ts providerCapabilities.test.ts cubenceRegression.test.ts`                 | 通过：4 个测试文件 / 29 条测试。                                                                                                                                  |
| `pnpm -F web typecheck`                                                                                                                             | 通过。                                                                                                                                                            |
| `pnpm -F server typecheck`                                                                                                                          | 通过。                                                                                                                                                            |
| `pnpm lint`                                                                                                                                         | 通过。                                                                                                                                                            |
| `pnpm typecheck`                                                                                                                                    | 通过：server `tsc --noEmit`、web `vue-tsc --noEmit` 均完成。                                                                                                      |
| `pnpm test`                                                                                                                                         | 通过：server 14 个测试文件 / 60 条测试，web 18 个测试文件 / 64 条测试。                                                                                           |
| `pnpm build`                                                                                                                                        | 通过：前端 Vite 构建完成，Worker `wrangler deploy --dry-run --outdir dist` 完成。                                                                                 |
| 本地服务健康检查                                                                                                                                    | 前端 `http://localhost:5173` 返回 200；API `http://localhost:8787/api/health` 返回 ok。                                                                           |
| 本机 Chrome 复测                                                                                                                                    | 通过：`/ai-image` 在 `390x844` 与 `1280x600` 下 `scrollWidth == clientWidth`，Prompt 面板可见。截图见 `test-artifacts/chrome-responsive/audit04-ai-image-*.png`。 |

说明：审核 04 没有新增业务修复代码，`1920x1080` 与 4K 视口结论沿用审核 03 的本机 Chrome 复测；本轮额外复测移动端和最低 PC 视口 `1280x600`。

## 关键缺陷

### P1：任务成功/失败实验事件仍依赖前端 WebSocket，用户离开页面会漏记结果

位置：`web/src/views/ai-image/useAiImageGenerationSubmit.ts` 59-79；`server/src/lib/tasks/run.ts` 483-499；`server/src/lib/tasks/failure.ts` 90-95

第三轮已经把 `generate_submitted` 放到 `/api/generate` 服务端同步写入，解决了“提交事件晚于结果事件”的竞态。但成功/失败事件仍只在 AI 图像页的 WebSocket 回调里上报：前端收到 `task.done` 才调用 `trackExperimentEvent("generate_succeeded")`，收到 `task.failed` 才调用 `trackExperimentEvent("generate_failed")`。服务端任务执行层目前只广播 `task.done` / `task.failed`，没有同步写入实验结果事件。

真实风险：

- 用户提交后关闭页面、刷新、网络断开或浏览器休眠，任务仍会在服务端完成，但 A/B 指标不会记录成功/失败。
- 结果事件接口走 `/api/experiments/events`，前端函数会吞掉失败；遇到限流、短暂网络错误或登录态失效时，结果也会静默丢失。
- sysadmin 页面看到的成功率会偏向“停留在页面直到任务完成”的用户，不能代表真实生成成功率。

建议：

- 在服务端任务终态落库后写入 `generate_succeeded` / `generate_failed`，优先通过同 `taskId` 的 `generate_submitted` 事件复用 variant、route、caseId。
- 前端 WebSocket 结果事件可以保留为过渡补偿，但服务端应去重或以服务端结果为准。
- 增加集成测试：创建带提交事件的 task，模拟服务端任务成功/失败，即使没有前端事件也能聚合到正确 variant。

### P2：用户自由输入 prompt 仍会被归因到当前案例

位置：`web/src/views/ai-image/useAiImageCases.ts` 118-125；`web/src/views/ai-image/AiImageGeneration.vue` 118-128

页面加载后会自动选中可用案例。用户点击“清空 Prompt”或手动大幅改写后，`finalPromptSource` 会变成 `null` 或 `user`，但 `selectedId` 不会清空；提交时仍使用 `cases.selected.value?.id` 作为 `caseId`，并用 `selectedCaseTitle` 作为会话标题。

真实风险：

- 用户只是把页面当作自由文生图入口使用，生成提交仍会统计到某个案例上。
- 案例转化率、案例筛选效果和 prompt 助手回填数据会被自由输入行为污染。
- 历史会话标题可能显示案例标题，但实际 prompt 已经与案例无关。

建议：

- 提交事件和会话标题按 `finalPromptSource` 分流：`case` 才带 `caseId` 和案例标题；`assistant` 可带 `assistantCaseId` 或 `caseContextId`；`user` / `null` 使用 prompt 摘要或默认标题。
- “清空 Prompt”如果代表脱离案例，应同时提供清空案例关联的状态；如果产品希望保留案例上下文，应在提交 metadata 里显式标记 `promptSource`。
- 增加组件测试：选中案例后清空并手写 prompt，提交 payload 不应带普通 `caseId`。

### P2：结果图面板可能展示旧会话或旧任务的图片

位置：`web/src/views/ai-image/useAiImageGenerationSubmit.ts` 51-57、141-154；`web/src/stores/session.ts` 250-275

`resultImages` 现在从 `sessions.messages` 末尾向前找第一条有附件的消息，没有限定当前 AI 图像页创建的 session 或 task。提交新任务前，组合函数只是把 `sessions.currentSessionId = null`，随后向全局 messages 追加新用户消息和助手消息，但不会清空旧消息。新任务完成前，右侧结果区域可能继续显示旧 session 的图片。

真实风险：

- 用户刚进入 `/ai-image` 或刚提交新任务时，看到的是上一次历史会话的结果，容易误以为新任务已经出图。
- 图生图提交时旧结果和当前参考图/案例并列展示，普通用户难以判断结果来源。
- 测试目前只覆盖 store 事件合并，没有覆盖 AI 图像页结果面板的 task/session 作用域。

建议：

- 在 `useAiImageGenerationSubmit()` 内维护 `activeTaskId` / `activeSessionId`，`resultImages` 只展示当前活动任务或当前页面创建 session 的附件。
- 新提交开始时清空当前页结果展示状态，任务完成后再填充。
- 增加组件或组合测试：store 内已有旧附件，新提交 queued 状态下右侧不显示旧图片。

### P3：Prompt 助手对话不会随案例、模式或 provider 上下文变化重置

位置：`web/src/views/ai-image/PromptAssistantPanel.vue` 21-26、35-39、56-58、79-100

助手请求会把当前 `mode`、`caseItem`、`provider` 和历史 messages 一起发给后端。但组件内部只 watch `finalPrompt` 来同步可编辑 prompt，没有在案例、模式或 provider 能力变化时清理旧 messages / latest。用户可能先围绕案例 A 聊了几轮，再选择案例 B 或从文生图切到图生图，后续请求会把旧对话和新上下文混在一起。

影响：

- AI 追问和最终 prompt 可能同时包含旧案例与新案例信息。
- 图生图/文生图模式切换后，助手仍保留旧模式下的问题链路。
- 这类问题不一定通过接口 schema 暴露，属于前端状态生命周期缺口。

建议：

- watch `caseItem?.id`、`mode`、provider model / supportedSizes，变化时提示用户“上下文已变化，是否重开助手对话”，或自动 reset。
- 如果保留旧对话，应在请求 metadata 中加入上下文版本，并在 UI 上显示当前对话绑定的案例/模式。

### P3：案例缩略图加载失败时没有切换到占位图

位置：`web/src/views/ai-image/PromptCaseGallery.vue` 51-56；`web/src/views/ai-image/PromptCaseDetail.vue` 47-52

本机 Chrome 复测中，部分本地案例缩略图 URL 加载失败，浏览器显示破图图标和 alt 文本。组件只在 `thumbnailUrl` 为空时显示 `ImageOff` 占位，没有处理 `<img>` 的 `error` 事件。

影响：

- 移动端卡片首屏观感受损，普通用户会误以为案例库质量差。
- 破图 alt 文本和精选标签叠在一起，虽然不造成布局溢出，但视觉上不够可靠。

建议：

- 抽一个小型 `PromptCaseThumbnail` 组件，内部处理 `@error` fallback、固定比例和占位图标。
- sysadmin 案例管理页保存/发布时可增加缩略图 URL 可访问性提示，但不应把远程网络失败作为发布硬阻断。

## 正向确认

- `generate_submitted` 已在 `/api/generate` 创建任务后、`startGenerateTask()` 前由服务端写入，第三轮 P1 竞态主路径已消除。
- provider 能力收缩后，案例选择模式与右侧生成模式可以同步回退，推荐尺寸不支持时会展示降级提示。
- 无可用案例时，系统能区分 case / assistant / user prompt 来源，不再无条件清空用户手写或助手回填 prompt。
- 参考图上传、粘贴、拖拽共用统一文件筛选逻辑；提交按钮和提交函数共用同一套校验规则。
- 本轮自动化验证、构建和最低 PC 视口真实 Chrome 复测均通过。

## 建议修复顺序

1. 先修服务端任务终态写入实验结果事件，避免 A/B 成功率继续依赖前端在线状态。
2. 修提交归因：`caseId`、会话标题和 metadata 必须跟 `finalPromptSource` 对齐。
3. 修 AI 图像页结果图作用域，避免旧任务图片出现在新任务流程里。
4. 修 Prompt 助手上下文生命周期，防止跨案例/跨模式对话混用。
5. 抽离案例缩略图 fallback 组件，改善本地和远程图片加载失败时的普通用户观感。

## 发布建议

当前状态适合继续内部 sysadmin / admin 试用，不建议扩大到普通用户灰度。若必须小范围灰度，建议先只观察打开率、助手使用率和提交率，不使用成功率/失败率作为决策指标，直到 P1 的服务端结果事件补齐。

## 修复状态

修复日期：2026-04-28

| 项目                        | 状态   | 修复说明                                                                                                                                                                                                       |
| --------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 任务结果事件依赖前端在线 | 已修复 | 服务端任务终态落库后写入 `generate_succeeded` / `generate_failed`，按 `taskId` 复用提交事件的 variant、route 与 caseId，并对重复结果事件做幂等跳过；没有 `generate_submitted` 的旧版任务不会产生孤立结果指标。 |
| P2 自由 prompt 污染案例归因 | 已修复 | 提交时按 `finalPromptSource` 决定是否携带普通 `caseId`；只有案例回填 prompt 才计入案例转化，自由输入和助手回填仅在 metadata 中保留上下文。                                                                     |
| P2 结果图展示旧任务图片     | 已修复 | AI 图像页维护当前 `activeTaskId` / `activeSessionId`，结果面板只展示当前页面提交任务的附件，新提交开始时清空旧结果作用域。                                                                                     |
| P3 助手上下文混用           | 已修复 | Prompt 助手在案例、模式或 provider 上下文变化时自动 reset，并用请求序号丢弃旧上下文的异步响应。                                                                                                                |
| P3 缩略图破图               | 已修复 | 新增 `PromptCaseThumbnail` 组件统一处理图片加载失败 fallback，案例列表和案例详情复用。                                                                                                                         |

已补充定向测试：`experiments.integration.test.ts`、`AiImageGeneration.test.ts`、`aiImageResultScope.test.ts`、`PromptCaseThumbnail.test.ts`。
