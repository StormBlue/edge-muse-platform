# AI 图像生成开发审核报告 01

审核日期：2026-04-28  
审核范围：`/ai-image` 用户页、提示词案例库、AI 提示词助手、生成入口 A/B 测试、图生图参考图便捷上传、本地 Turnstile 绕过。  
关联文档：[`../design-docs/ai-image-generation-page.md`](../design-docs/ai-image-generation-page.md)、[`../exec-plans/ai-image-generation-page-tasks.md`](../exec-plans/ai-image-generation-page-tasks.md)

## 结论

本轮功能主体已经可构建、可类型检查、可通过现有自动化测试；代码按前后端分层拆分，案例库、实验、助手和参考图上传都有独立领域模块或组合函数，整体方向可继续推进。

本报告初审时不建议直接扩大到普通用户灰度。主要风险不是编译错误，而是 A/B 实验状态、指标采集和 AI 图像页提交漏斗存在业务口径偏差，会让 sysadmin 看到的实验数据不可信，甚至在“暂停实验”后仍影响用户入口。P1/P2 代码问题已在 2026-04-28 修复；进入 AIG-042 灰度前仍需完成登录后的浏览器视觉复测与真实环境 Workers AI 联调。

## 修复状态

2026-04-28 已按本报告完成代码修复和自动化回归：

| 审核项                                 | 状态   | 修复证据                                                                                      |
| -------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| 暂停实验对强制策略仍然生效             | 已修复 | `getGenerationExperienceForUser()` 在 `paused` 下只保留既有 A/B 分配；新增 D1 集成测试。      |
| A/B 指标被并列展示和 sysadmin 预览污染 | 已修复 | direct switch 仅在运行中的单入口策略记录；指标默认排除 `isSysadminPreview`。                  |
| 生成提交事件先于前端校验               | 已修复 | 提交前校验抽为纯函数；`generate_submitted` 只在 `/api/generate` 接受任务后上报并带 `taskId`。 |
| 案例筛选模式与应用模式混用             | 已修复 | 拆分 `filterMode` 和 `selectedMode`，筛选器不再被选中案例反向改写。                           |
| 实验事件接口允许任意事件名且没有限流   | 已修复 | 事件名改为白名单枚举；`POST /api/experiments/events` 加生产限流。                             |
| AI 助手语言固定为中文                  | 已修复 | 前端按当前 UI locale 映射为助手接口语言。                                                     |
| 页面组件级案例管理交互测试缺口         | 已修复 | 新增编辑弹层、导入弹层和案例表格组件测试。                                                    |
| 浏览器视觉复测                         | 待确认 | 自动化验证已通过；登录本地浏览器复测需用户确认使用 README 默认测试账号。                      |

## 验证结果

| 命令               | 结果                                                                              |
| ------------------ | --------------------------------------------------------------------------------- |
| `pnpm typecheck`   | 通过：server `tsc --noEmit`、web `vue-tsc --noEmit` 均完成。                      |
| `pnpm test`        | 通过：server 14 个测试文件 / 54 条测试，web 12 个测试文件 / 42 条测试。           |
| `pnpm build`       | 通过：前端 Vite 构建完成，Worker `wrangler deploy --dry-run --outdir dist` 完成。 |
| `git diff --check` | 通过：仅提示 LF 将被 CRLF 替换，无空白错误。                                      |

## 关键缺陷

### P1：暂停实验对强制策略仍然生效

位置：`server/src/lib/experiments.ts` 123-151、203-228

需求文档写明“暂停实验后保持既有用户分配，但不再新增分配”。当前实现只在 `ab_test` 的 `resolveAssignment()` 中通过 `status !== "running"` 避免新增分配；但 `force_legacy` 和 `force_ai` 在 `paused` 状态下仍会直接返回 A/B 入口。结果是 sysadmin 点击“暂停”后，范围内用户仍可能被强制只看到 AI 图像生成或旧版图像生成，暂停语义失效。

建议：

- `draft`、`paused`、`archived` 默认不改变普通用户入口，除非明确要读取已有 `experiment_assignments`。
- 为 `paused + force_ai`、`paused + force_legacy`、`paused + ab_test` 无既有分配补集成测试。

### P1：A/B 指标会被并列展示和 sysadmin 预览污染

位置：`web/src/components/layout/generationExperimentEvents.ts` 46-80、`server/src/lib/experiments.ts` 167-200

前端判断直接访问时只比较 `experience.navTarget !== targetRoute`。默认 `draft + parallel` 或并列展示时 `navTarget` 是 `/workspace`，普通用户从可见导航点击 `/ai-image` 也会被记录为 `directAccess=true` 和 `variant_switched_directly`。这不是“用户绕过分配访问另一变体”，而是正常并列入口。

同时服务端指标聚合未过滤 `isSysadminPreview`，sysadmin 在验收页面时产生的 `sysadmin` 事件会直接进入 `/api/sysadmin/experiments/generation` 指标表。需求文档已标注“指标默认排除 sysadmin”。

建议：

- 只有 `status === "running"` 且 `strategy === "ab_test"` 或强制单入口策略时，才记录直接切换。
- `getGenerationExperimentMetrics()` 默认加 `isSysadminPreview = false`，必要时 sysadmin 页面增加“包含预览事件”开关。
- 增加并列展示、draft 默认态、sysadmin 预览的事件纯函数和 D1 聚合测试。

### P1：生成提交事件先于前端校验，提交率会虚高

位置：`web/src/views/ai-image/AiImageGeneration.vue` 84-95、`web/src/views/ai-image/useAiImageGenerationSubmit.ts` 111-153、`web/src/views/ai-image/AiImagePromptPanel.vue` 247-255

`generate_submitted` 在调用 `generation.submit()` 前立即上报；但 `generation.submit()` 内部可能因为 prompt 为空、任务正在运行、模式不支持、尺寸不支持或图生图缺参考图直接返回。按钮本身也只禁用了 `submitting || hasRunningTask`，不会在 prompt 为空或图生图无参考图时阻止点击。这样会把无效点击计入生成提交，A/B 转化率和漏斗指标都会偏高。

建议：

- 将提交前校验抽成纯函数，返回 `{ ok, reason }`。
- 仅在 `/api/generate` 成功返回 task 后记录 `generate_submitted`，并带上 `taskId`。
- 按校验结果禁用按钮或给出明确 toast，至少覆盖空 prompt 和图生图缺参考图。

### P2：AI 图像页案例筛选模式与案例应用模式混用

位置：`web/src/views/ai-image/useAiImageCases.ts` 23-61、`web/src/views/ai-image/promptCaseSelection.ts` 49-56

`useAiImageCases.mode` 同时承担“案例筛选条件”和“选中案例时的模式回填”。初次加载案例时 `selectCase(items[0])` 会把筛选器改成首个案例的模式，导致用户还没主动筛选，另一种模式的案例就可能被隐藏。`promptCaseApplyResult()` 还会保留当前筛选模式，即使当前模式不属于被选案例，也可能产生不一致的状态。

建议：

- 拆成 `filterMode` 和 `selectedCaseMode`，筛选状态不应被选中案例反向修改。
- `promptCaseApplyResult()` 只在 `item.modes.includes(currentMode)` 时保留当前模式，否则回退到案例默认模式。
- 增加“初次加载保持全部模式”“选择不同模式案例不污染筛选器”的单测。

### P2：实验事件接口允许任意事件名且没有限流

位置：`server/src/lib/experiments.ts` 30-48、`server/src/routes/experiments.ts` 11-20

`experimentEventSchema.eventName` 先列举了固定事件，但又 `.or(z.string().trim().min(1).max(80))`，实际任何已登录用户都可以写入任意事件名。事件接口也没有限流。虽然服务端会重新计算 variant 并脱敏 metadata，但攻击者或异常客户端仍可刷写 D1，污染 sysadmin 指标表。

建议：

- MVP 阶段限制为固定事件枚举；未来扩展事件可走服务端白名单配置。
- 给 `/api/experiments/events` 增加轻量限流，例如每用户每分钟 60 次。
- 对未知事件名、超频写入补测试。

### P2：AI 助手语言固定为中文

位置：`web/src/views/ai-image/PromptAssistantPanel.vue` 76-96

后端支持 `zh-CN` 和 `en-US`，但前端请求写死 `locale: "zh-CN"`。英文界面用户仍会得到中文追问和中文 final prompt，和现有 i18n 页面不一致。

建议：

- 从 `useUiStore().locale` 或 `vue-i18n` 当前 locale 传给助手接口。
- 增加不同 locale 的请求体单测或组件交互测试。

## 功能缺口

| 缺口                                           | 影响                                                                                              | 建议                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| AIG-040 的“页面组件级案例管理交互测试”仍未完成 | 纯函数和组合函数覆盖较好，但弹层、表单、表格联动未被真实组件测试保护。                            | 补 `PromptCases.vue`、`PromptCaseEditor.vue`、`PromptCaseImportDialog.vue` 的组件测试。              |
| 灰度发布未执行                                 | 文档中 AIG-042 仍为 TODO，尚未对内部用户或 25% 普通用户运行。                                     | 修完 P1/P2 后再进入内部灰度。                                                                        |
| 本轮审核未做浏览器视觉复测                     | 自动化构建通过，但未重新登录浏览器检查 `/ai-image`、sysadmin 案例页和实验页。                     | 启动 dev 服务后用真实浏览器复核桌面/移动端，尤其检查 Turnstile 本地绕过、拖拽/粘贴参考图和助手回填。 |
| Workers AI 真实输出未联调                      | 当前测试覆盖降级路径和 schema，未确认 Cloudflare Workers AI 在生产 binding 下输出 JSON 的稳定性。 | 在 staging/预览环境记录降级率、解析失败率和平均耗时。                                                |

## 正向确认

- 提示词案例库后端有 Zod 校验、发布前归因检查、导入默认 draft 和审计日志，敏感 prompt 未写入 audit payload。
- AI 提示词助手仅开放 `text2image`、`image2image`，有输入长度限制、每日限流和降级输出。
- 参考图点击上传、粘贴、拖拽已抽到 `referenceImageFiles.ts`，两个入口复用筛选和压缩逻辑。
- `/api/me`、登录、刷新和资料更新都返回 `generationExperience`，前端 store 也会在登出时清理。
- 新增代码大多已拆分到领域函数、组合函数和小组件；本次新增文件中未发现单文件异常膨胀。

## 建议修复顺序

1. 修 `experiments.ts` 的暂停状态语义，并补 D1 集成测试。
2. 修实验事件口径：并列展示不算 direct switch，指标默认排除 sysadmin。
3. 修 AI 图像页提交校验和 `generate_submitted` 上报时机。
4. 拆分案例筛选模式与生成模式，补用户端案例选择测试。
5. 收紧实验事件 schema 与限流。
6. 接入助手 locale，并补英文界面测试。
7. 完成组件级测试和浏览器视觉复测后，再更新 AIG-042 灰度任务状态。
