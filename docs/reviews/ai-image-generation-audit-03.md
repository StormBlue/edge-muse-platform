# AI 图像生成开发审核报告 03

审核日期：2026-04-28  
审核范围：审核报告 02 修复后的变更集，重点复核任务事件归因、案例 locale / provider 能力过滤、AI 图像生成提交链路、Prompt 助手、测试与发布文档状态。  
关联文档：[`./ai-image-generation-audit-01.md`](./ai-image-generation-audit-01.md)、[`./ai-image-generation-audit-02.md`](./ai-image-generation-audit-02.md)、[`../exec-plans/ai-image-generation-page-tasks.md`](../exec-plans/ai-image-generation-page-tasks.md)

## 结论

第二轮 P1/P2 修复总体有效，自动化验证全部通过。任务结果事件已能按 `taskId` 优先复用提交事件变体快照；案例库已改为按 UI locale 加载，并按 provider `supportedModes` 过滤；测试依赖和 AIG-041 文档状态也已修正。

但第三轮仍不建议直接进入普通用户灰度。剩余风险不是编译失败，而是两个跨异步状态路径仍可能影响真实用户和 A/B 指标可信度：`generate_submitted` 与 WebSocket 结果事件存在上报竞态；provider 能力变化后，案例内部重选不会同步右侧生成面板模式。另一个产品缺口是案例推荐尺寸仍未按当前 provider 能力做可见降级说明，普通用户可能以为选择了某个画幅，实际生成时使用的是旧尺寸或默认尺寸。

## 验证结果

| 命令               | 结果                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- |
| `pnpm lint`        | 通过。                                                                                |
| `pnpm typecheck`   | 通过：server `tsc --noEmit`、web `vue-tsc --noEmit` 均完成。                          |
| `pnpm test`        | 通过：server 14 个测试文件 / 60 条测试，web 18 个测试文件 / 64 条测试。               |
| `pnpm build`       | 通过：前端 Vite 构建完成，Worker `wrangler deploy --dry-run --outdir dist` 完成。     |
| `git diff --check` | 通过：仅提示 LF 将被 CRLF 替换，无空白错误。                                          |
| 浏览器登录复测     | 通过：本机 Chrome 使用 sysadmin 本地账号登录后完成 `/ai-image` 与 sysadmin 页面复测。 |

## 关键缺陷

### P1：`generate_submitted` 与任务结果事件仍存在上报竞态

位置：`web/src/views/ai-image/useAiImageGenerationSubmit.ts` 53-72、131-146；`web/src/views/ai-image/AiImageGeneration.vue` 84-98；`server/src/lib/experiments.ts` 207-239

第二轮把结果事件归因改成按 `taskId` 查询 `generate_submitted`，方向正确。但前端时序仍是：

1. `sessions.generate()` 返回 `taskId` 和 `wsUrl`。
2. `useAiImageGenerationSubmit.submit()` 先执行 `connect(task.wsUrl)`。
3. 外层 `AiImageGeneration.submitGeneration()` 再 `void trackExperimentEvent({ eventName: "generate_submitted" })`，且不等待事件写入。

如果任务极快失败/完成，或事件接口网络抖动，WebSocket 收到 `task.done` / `task.failed` 后会先上报 `generate_succeeded` / `generate_failed`。服务端此时查不到同 `taskId` 的 `generate_submitted`，会走 fallback 到当前实验分配。这样第二轮修复仍可能在快任务、失败任务或弱网下失效。

影响：

- 成功/失败事件可能再次被归到当前变体，而不是提交时变体。
- 报表中会出现带 `attributionFallback: true` 的结果事件，即使该任务其实已经在客户端成功提交。
- 长期 A/B 成功率会受到事件上报顺序污染。

建议：

- 最小修复：`sessions.generate()` 返回后先等待 `generate_submitted` 写入成功，再连接 WebSocket；或把事件上报函数改成可等待并对失败有可见日志。
- 更稳妥修复：在 `/api/generate` 接受任务时由服务端直接写入提交事件或生成任务归因快照，避免依赖前端 fire-and-forget 事件。
- 增加竞态测试：模拟 `task.done` 在 `generate_submitted` 写入前到达，验证最终指标不回退到当前分配。

### P2：provider 能力变化后的内部案例重选不会同步生成面板模式

位置：`web/src/views/ai-image/useAiImageCases.ts` 70-72、118-128；`web/src/views/ai-image/AiImageGeneration.vue` 52-62、105-109；`web/src/views/ai-image/useAiImageGenerationSubmit.ts` 32-37、76-87

`useAiImageCases()` 现在会在 `supportedModes` 变化时调用 `ensureAvailableSelection()`，并在当前案例不可用时内部 `selectCase(available[0])`。但这个内部重选只更新 `cases.selectedId`、`cases.finalPrompt`、`cases.selectedMode`，不会通知 `AiImageGeneration.vue` 调用 `syncGenerationFromCase()`。右侧生成面板的 `generation.mode` 只在用户主动选案例、应用案例和初次 mounted 后同步。

典型风险：

- 初始 provider 能力为空时默认支持文生图/图生图，页面可能先选中图生图或混合案例。
- bootstrap 或用户 key 变化后，真实 provider 只支持文生图。
- 左侧案例列表已经按能力过滤或重选，但右侧 `generation.mode` 仍停留在旧的 `image2image`，提交按钮被 `mode_unsupported` 或 `reference_required` 卡住。

影响：

- 普通用户看到案例可用，但右侧生成模式/提交状态与案例不一致。
- 这类问题不一定通过现有测试暴露，因为测试只断言 `cases.selectedMode`，没有覆盖外层生成面板同步。

建议：

- 将“案例选择结果”作为显式事件或 watch 源，在 `selectedMode` / `selected` / `supportedModes` 变化时统一同步 `generation.mode` 和尺寸。
- 或把 `useAiImageCases()` 的内部重选改为只产出结果，由页面层统一调用 `syncGenerationFromCase()`。
- 增加组件或组合测试：provider 从 `["text2image", "image2image"]` 变为 `["text2image"]` 后，右侧 `generation.mode` 必须自动落到 `text2image`。

### P2：案例推荐尺寸仍未按 provider 能力过滤或提示降级

位置：`web/src/views/ai-image/useAiImageCases.ts` 58-67；`web/src/views/ai-image/AiImageGeneration.vue` 58-62、71-75、174-178

第二轮修复只处理了 `supportedModes`，没有处理 `supportedSizes`。当前尺寸筛选项来自所有可用案例的 `recommendedSize`，而不是当前 provider 的 `sizeOptions`。当用户选择推荐尺寸不受当前 provider 支持的案例时，`syncGenerationFromCase()` 和 `fillAssistantPrompt()` 只是在尺寸不存在时静默不改 `generation.size`。

影响：

- 用户可能按“竖版海报 / 9:16”筛选并选择案例，但右侧实际仍使用旧尺寸或 provider 默认尺寸。
- AI 助手返回的推荐尺寸不支持时也会静默丢弃，用户无法理解为什么最终画幅没变。
- 对普通用户来说，这是“案例承诺”和“最终生成参数”不一致。

建议：

- 至少在案例详情或生成面板展示“推荐尺寸不受当前服务商支持，将使用 X”。
- 更严格方案：案例列表按 `sizeOptions` 过滤或标记不适配案例。
- 增加测试：provider 不支持案例 `recommendedSize` 时，页面应出现降级提示，或案例不进入对应尺寸筛选结果。

### P2：浏览器视觉与真实登录流程仍未复测

位置：`docs/exec-plans/ai-image-generation-page-tasks.md` 347-360

AIG-041 已正确回到 `REVIEW`，但第三轮仍没有完成登录后的桌面/移动端浏览器复测。当前自动化测试能覆盖纯函数、组合函数、组件和构建，却不能覆盖以下风险：

- `/ai-image` 三栏布局在真实数据、长中文 prompt、移动端 sheet 下是否溢出。
- sysadmin 案例管理页和实验管理页在本轮组件拆分后是否存在视觉错位。
- Turnstile dev 跳过、本地登录、provider 能力加载、AI 助手降级提示是否在真实浏览器串起来。

建议：

- 在修复 P1/P2 后执行一次真实浏览器验收，再把 AIG-041 标回 `DONE`。
- 记录账号角色、页面路径、视口尺寸、关键动作和结果截图路径，避免后续“已验收”口径漂移。

### P3：无可用案例时仍保留旧 prompt 和旧模式

位置：`web/src/views/ai-image/useAiImageCases.ts` 118-123

当 provider 能力或 locale 变化导致 `availableItems` 为空时，`ensureAvailableSelection()` 只把 `selectedId` 设为 `null`，没有清空 `finalPrompt` 和 `selectedMode`。如果此前用户选过案例，右侧 prompt 仍可能保留旧案例内容，页面标题变成空白案例，但生成参数仍来自旧上下文。

影响：

- 用户可能在“没有可用案例”的状态下提交旧 prompt。
- 实验事件的 `caseId` 为空，但 prompt 实际来自上一个案例，案例转化归因不准确。

建议：

- 明确产品规则：无案例时保留用户手写 prompt，还是清空案例回填 prompt。
- 如果保留，应增加 `promptSource` / `dirty` 状态，区分用户手写和案例回填；如果清空，应同时清 `finalPrompt`、`selectedMode`，并提示当前语言或服务商暂无案例。

## 正向确认

- 审核 02 的任务结果归因主逻辑已经落地，并有 D1 集成测试覆盖“提交后暂停实验仍归到 B”和“缺提交事件时 fallback”。
- 用户端案例库已经按当前 UI locale 请求 published 案例，且有组合函数测试覆盖 `en-US`。
- 案例模式过滤和案例应用逻辑已按 provider `supportedModes` 收敛，纯 `image2image` 案例不会出现在仅支持文生图的 provider 下。
- `@vue/test-utils` 与 `happy-dom` 已改为精确版本，`docs/TESTING.md` 已补充组件测试约定。
- AIG-041 文档状态保持 `REVIEW` 是正确的，没有把未复测的 UI 路径误标为完成。

## 建议修复顺序

1. 先修 `generate_submitted` 与 WebSocket 结果事件竞态；这是灰度指标可信度的核心。
2. 修 provider 能力变化后的案例/生成面板同步，避免普通用户进入不可提交状态。
3. 补案例推荐尺寸的 provider 适配提示或过滤规则。
4. 明确无可用案例时的 prompt 保留策略，并补对应测试。
5. 完成后再次运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`，再做真实浏览器复测，最后恢复 AIG-041 为 `DONE`。

## 修复状态

修复日期：2026-04-28

| 项目                     | 状态   | 修复说明                                                                                                                                                    |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 提交/结果事件竞态     | 已修复 | AI 图像页提交事件随 `/api/generate` 请求传给后端，后端在 `startGenerateTask()` 前同步写入 `generate_submitted`，结果事件不再依赖前端 fire-and-forget 顺序。 |
| P2 provider 能力变化同步 | 已修复 | `useAiImageCases()` 会在能力收缩时重新计算 `selectedMode`；页面层通过 watch 同步右侧 `generation.mode` 与尺寸，并补组件测试覆盖。                           |
| P2 推荐尺寸降级          | 已修复 | 新增推荐尺寸解析与 fallback 提示；案例尺寸不受当前 provider 支持时，生成面板展示实际使用尺寸。                                                              |
| P2 浏览器视觉复测        | 已完成 | 使用本机 Chrome 复测移动端 `390x844`、PC `1280x600`、`1920x1080`、`3840x2160`，并检查 sysadmin 案例管理与实验管理页。                                       |
| P3 无可用案例旧 prompt   | 已修复 | 记录 prompt 来源；provider/locale 变化导致无可用案例时，只清理案例回填 prompt，保留用户手写或助手回填内容。                                                 |

已补充定向测试：`AiImageGeneration.test.ts`、`aiImageSizeFallback.test.ts`、`useAiImageCases.test.ts`、`session.test.ts`。

## 浏览器复测记录

复测日期：2026-04-28

复测方式：使用本机 Chrome 独立用户目录与 CDP 调试端口登录本地开发环境，账号为 README 中的本地 `sysadmin@example.com` / `password123`。

复测页面与视口：

- `/ai-image`：`390x844`、`1280x600`、`1920x1080`、`3840x2160`。
- `/sysadmin/prompt-cases`：`1280x600`。
- `/sysadmin/experiments/generation`：`1280x600`。

结论：页面整体无横向溢出，移动端与 PC 端布局未发现明显重叠、截断或空白；sysadmin 两个管理页在 `1280x600` 下表格区域保持容器内横向滚动。截图保存在 `test-artifacts/chrome-responsive/`。部分案例缩略图在本地数据下显示图片占位/加载失败图标，属于案例素材源加载问题，不影响本轮响应式布局验收。
