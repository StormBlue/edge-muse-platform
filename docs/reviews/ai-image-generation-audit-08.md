# AI 图像生成开发审核报告 08

审核日期：2026-04-28

审核范围：审核报告 07 修复后的当前 HEAD，重点复核 Workers AI 绑定类型、A/B 分配与流量扩容语义、direct access 对生成漏斗的污染、案例筛选稳定性，以及前几轮实验事件边界是否回归。

关联文档：[`./ai-image-generation-audit-01.md`](./ai-image-generation-audit-01.md)、[`./ai-image-generation-audit-02.md`](./ai-image-generation-audit-02.md)、[`./ai-image-generation-audit-03.md`](./ai-image-generation-audit-03.md)、[`./ai-image-generation-audit-04.md`](./ai-image-generation-audit-04.md)、[`./ai-image-generation-audit-05.md`](./ai-image-generation-audit-05.md)、[`./ai-image-generation-audit-06.md`](./ai-image-generation-audit-06.md)、[`./ai-image-generation-audit-07.md`](./ai-image-generation-audit-07.md)、[`../design-docs/ai-image-generation-page.md`](../design-docs/ai-image-generation-page.md)、[`../exec-plans/ai-image-generation-page-tasks.md`](../exec-plans/ai-image-generation-page-tasks.md)

## 结论

第七轮修复的主线没有回归：公开 `/api/experiments/events` 已收窄到客户端 UX 事件，任务提交和终态事件走服务端路径；终态指标只统计 `server_task_terminal` 来源；sysadmin 指标默认限制最近 30 天；前端 `trackExperimentEvent()` 也已使用窄事件类型。

但当前仍不能发布。最直接的阻断是 `pnpm typecheck` 失败：Workers AI binding 已写入 `wrangler.jsonc`，但 `Cloudflare.Env` 类型没有声明 `AI`，导致服务端类型检查失败。其次，A/B 流量配置存在业务口径漏洞：非手工 assignment 一旦写入就永久复用，sysadmin 把 B 流量从 25% 扩到 50% 或 100% 时，已经访问过且曾分到 A 的用户不会按稳定哈希进入新增 B 桶，真实入口流量会低于配置。

此外，direct access 虽然有单独事件，但生成提交/成功/失败指标仍按当前分配 variant 聚合且 sysadmin 页面不展示 route/directAccess 维度，直达另一路由后的真实生成会污染主入口转化判断。前端全量测试还暴露了案例分类排序的 locale 敏感失败。

## 验证结果

| 命令 / 检查                                                                                                                                                                                                                              | 结果                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm -F server test -- experiments.integration.test.ts experiments.test.ts`                                                                                                                                                             | 通过：Vitest 实际执行 server 14 个测试文件 / 68 条测试。                                             |
| `pnpm -F web test -- generationExperimentEvents.test.ts generationExperimentRisk.test.ts generationExperimentPresets.test.ts useWorkspaceActions.test.ts AiImageGeneration.test.ts PromptAssistantPanel.test.ts useAiImageCases.test.ts` | 失败：Vitest 实际执行 web 22 个测试文件 / 73 条测试，其中 `promptCaseSelection.test.ts` 1 条失败。   |
| `pnpm typecheck`                                                                                                                                                                                                                         | 失败：`server/src/lib/promptAssistant.ts` 访问 `env.AI`，但 `Cloudflare.Env` 类型缺少 `AI` binding。 |
| `pnpm lint`                                                                                                                                                                                                                              | 通过。                                                                                               |

说明：本轮没有启动浏览器视觉复测，也没有执行 `pnpm build`；当前 typecheck 已经阻断构建链路。

## 关键缺陷

### P1：Workers AI binding 未声明到服务端 Env 类型，类型检查与构建链路被阻断

位置：`server/src/lib/promptAssistant.ts` 90-103；`server/src/env.d.ts` 1-12；`server/wrangler.jsonc` 38-47

`wrangler.jsonc` 已配置：

```json
"ai": {
  "binding": "AI"
}
```

但 `server/src/env.d.ts` 的 `Cloudflare.Env` 只声明了 `ENVIRONMENT`、`PROMPT_ASSISTANT_MODEL`、D1/R2/KV 之外的 secrets 等，没有声明 `AI`。`runPromptAssistantTurn()` 直接访问 `env.AI`，因此 `pnpm typecheck` 报：

```text
server typecheck: src/lib/promptAssistant.ts(92,14): error TS2339: Property 'AI' does not exist on type 'Env'.
server typecheck: src/lib/promptAssistant.ts(93,30): error TS2339: Property 'AI' does not exist on type 'Env'.
```

真实影响：

- `pnpm typecheck` 失败，`pnpm build` 会在前置类型检查阶段被挡住。
- AI Prompt 助手已经进入实现状态，但类型层没有真实表达 Cloudflare binding，后续重构容易继续绕过 Workers AI 类型约束。

建议：

- 在 `server/src/env.d.ts` 中补 `AI` binding 类型，并确保本地类型来源与当前 Wrangler / workers-types 版本一致。
- 给 `PROMPT_ASSISTANT_MODEL` 和 `AI` binding 增加一个最小类型测试或 `server typecheck` 保护，避免后续配置改动只改 wrangler 不改 Env。
- 修复后重新执行 `pnpm typecheck`、`pnpm build`。

### P1：A/B assignment 永久复用，流量从 25% 扩到 50%/100% 时已访问用户不会按稳定哈希重新分配

位置：`server/src/lib/experiments.ts` 118-154、176-196、583-603；`server/src/db/schema.ts` 355-380；`docs/design-docs/ai-image-generation-page.md` 248-252

设计文档要求 sysadmin 能设置 A/B 流量，分配方式为 `userId + experimentKey + salt` 稳定哈希，并支持 0/25/50/75/100。当前实现只有第一次进入 `ab_test` 时按哈希写入 `experiment_assignments`；之后 `resolveAssignment()` 在任何 running A/B 状态下都会先返回既有 assignment：

```ts
const existing = await findExistingAssignment(env, userId);
if (existing) return existing;
```

这会让“是否曾访问过”成为分流结果的一部分，而不是只由稳定哈希和当前 traffic 决定。

真实风险：

- sysadmin 先开 25% B 变体时，bucket 25-99 的活跃用户会写入 A。
- 后续把流量扩到 50% 或 100% 时，这些已经写入 A 的用户仍然留在 A；只有从未访问过的新用户会按新阈值分配。
- sysadmin 页面显示的 `trafficPercent` 与真实入口流量不一致，灰度扩量会被低估；如果以为已经 50% B，实际可能仍接近最早一次配置的 B 占比。
- `paused` 需要冻结既有分配是合理的，但 running 状态下非手工 assignment 不应永久覆盖当前稳定哈希阈值。

建议：

- 区分 `manualOverride` 与普通哈希分配：running + `ab_test` 时，手工覆盖直接使用；非手工 assignment 按当前 traffic 和 salt 重新计算，必要时更新 assignment 行。
- `paused + ab_test` 才读取既有 assignment 且不新增，保持第 1 轮修复后的暂停语义。
- 增加集成测试：25% 下访问得到 A 的用户，在 traffic 调到 100% 后应进入 B；paused 后新用户不应新增 assignment；manual override 不应被哈希覆盖。

### P2：direct access 只记录了切换事件，生成漏斗仍会被另一路由的提交污染

位置：`web/src/components/layout/generationExperimentEvents.ts` 47-90；`web/src/views/workspace/useWorkspaceActions.ts` 225-242；`web/src/views/ai-image/AiImageGeneration.vue` 118-137；`server/src/lib/experiments.ts` 348-369、492-520；`web/src/views/sysadmin/GenerationExperiment.vue` 201-239

设计文档允许用户直接访问另一个路由，但要求记录 `direct_access` 事件，避免污染主入口转化判断。当前前端确实会上报 `variant_switched_directly`，页面打开事件 metadata 也有 `directAccess`。问题是提交和终态事件仍只按当前服务端分配 variant 聚合，sysadmin 指标表也只展示 `variant + eventName + count`。

典型场景：

- 用户被分到 B，侧栏只显示 `/ai-image`。
- 用户手动输入 `/workspace` 并在专业工作台生成图片。
- `/workspace` 提交会带 `route: "/workspace"`，但服务端 `recordExperimentEvent()` 仍把事件归到当前 assignment，也就是 B。
- sysadmin 指标里 B 的 `generate_submitted` / `generate_succeeded` 增加了，但真实体验来自 A 页面。

真实影响：

- 主入口转化、成功率、失败率不再代表“用户使用被分配入口后的表现”。
- direct access 事件只能提示有直达行为，无法从当前聚合表中剔除对应生成结果。
- 如果小范围灰度用户习惯直达旧工作台，B 变体成功率可能被旧页面体验托高。

建议：

- 提交事件记录并聚合 `assignedVariant` 与 `routeVariant` 两个维度；sysadmin 默认主漏斗只统计 `routeVariant === assignedVariant` 的事件。
- 或在页面打开时为当前 route 生成 direct-access session 标记，后续生成提交 metadata 带 `directAccess: true`，聚合层默认排除。
- sysadmin 页面至少展示 route 维度和 direct access 计数，避免只看 variant 总数做灰度决策。

### P2：案例分类排序依赖默认 locale，前端测试在当前环境失败

位置：`web/src/views/ai-image/promptCaseSelection.ts` 21-73；`web/src/views/ai-image/promptCaseSelection.test.ts` 61-64

`promptCaseCategories()` 和 `promptCaseSizes()` 通过 `uniqueSorted()` 排序，内部使用默认 `a.localeCompare(b)`。在当前 Node/ICU 环境下，`["商业广告", "角色设计"]` 的排序结果与测试期望 `["角色设计", "商业广告"]` 相反，导致 web 测试失败：

```text
expected [ '商业广告', '角色设计' ] to deeply equal [ '角色设计', '商业广告' ]
```

真实影响：

- `pnpm test` 当前不能全绿。
- 案例分类 tabs 的顺序可能随运行环境、浏览器 locale 或 Node ICU 数据变化而变化。
- 如果产品希望按 MVP 分类顺序展示，默认字典序本身也不符合“人像与摄影 / 商品与广告 / 海报与插画 ...”这样的业务顺序。

建议：

- 明确案例分类顺序：优先用产品定义的 7 类顺序，其余分类再按固定 locale 排序。
- 如果只需要字典序，显式传入 locale，例如 `localeCompare(b, "zh-CN")`，并同步更新测试期望。
- 补一条“未知分类追加在业务分类之后”的测试，避免 sysadmin 新增分类时顺序抖动。

## 功能缺口

| 缺口                       | 位置 / 证据                                                                 | 影响                                                                                        | 建议                                                                                          |
| -------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 手动覆盖分配未落地         | `experiment_assignments.manualOverride` 只有字段，未见 sysadmin API/UI 写入 | 设计文档要求“也允许手动覆盖”，当前无法把指定用户强制放入 A 或 B，内部排障和定向灰度不方便。 | 增加 sysadmin assignment 列表/编辑接口，支持 userId -> A/B 手动覆盖，并在分配逻辑中优先使用。 |
| 指标仍只有计数没有率       | `GenerationExperiment.vue` 只显示 `variant`、`eventName`、`count`           | sysadmin 需要手工心算提交率、成功率、重试成功率，容易在灰度判断时误读。                     | 在后端返回派生指标或前端分组计算曝光->提交、提交->成功、失败->重试成功等核心率。              |
| 真实 Workers AI 联调未记录 | 当前测试覆盖降级路径，未见 staging/production JSON mode 成功率记录          | AI 助手可能在真实模型输出非 JSON 时高频降级，用户体验与本地测试不一致。                     | 发布前记录解析失败率、降级率、平均耗时，并把 Workers AI 可用性纳入验收清单。                  |

## 正向确认

- `POST /api/experiments/events` 已使用 `clientExperimentEventSchema`，浏览器不能再通过公开接口写 `generate_submitted`、`generate_succeeded`、`generate_failed`。
- 服务端任务终态事件只统计 `resultEventSource === "server_task_terminal"`，旧客户端终态占位不会再阻断真实服务端终态指标。
- `/workspace` 的 chat 模式不再进入默认文生图/图生图漏斗；重试任务会派生 `generate_retry_*` 指标。
- Prompt 助手上下文 key 已覆盖案例、模式、provider 尺寸能力、最大参考图数和参考图稳定 key，同数量替换参考图会 reset。
- sysadmin 实验页已有风险摘要和灰度预设，且全量强制新版、全量高流量 B 变体、仅排除名单等高风险配置能被提示。

## 建议修复顺序

1. 先修 P1 类型阻断：补 `AI` binding 类型，确认 `pnpm typecheck` 和 `pnpm build` 可通过。
2. 修 A/B assignment 语义：running 状态按当前 traffic + salt 重新计算非手工分配，paused 状态才冻结既有 assignment，并补 25% -> 100% 扩量测试。
3. 修 direct access 指标口径：提交/终态指标加入 routeVariant 或 directAccess 维度，sysadmin 主漏斗默认排除直达另一路由后的生成。
4. 固定案例分类排序策略并修复 web 测试失败。
5. 补手动覆盖 assignment 的 sysadmin API/UI，或把设计文档中的“允许手动覆盖”明确降级到后续阶段。
6. 重新执行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`，再做 `/ai-image`、`/workspace`、`/sysadmin/experiments/generation` 的浏览器复测。

## 发布建议

当前不建议进入普通用户灰度，也不建议把 sysadmin 实验页成功率作为扩量依据。功能主链路可以继续由 sysadmin/admin 内部试用，但必须先解除类型检查阻断，并修正 A/B 流量扩容和 direct access 漏斗口径；否则 25% 到 50%/100% 的发布动作会出现“配置看起来已扩量，真实已访问用户没有扩量”的业务偏差。
