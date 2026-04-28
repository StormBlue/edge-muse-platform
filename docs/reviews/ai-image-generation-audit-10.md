# AI 图像生成开发审核报告 10

审核日期：2026-04-28

审核范围：审核报告 09 修复后的当前工作树，重点复核 paused A/B 下清除手动覆盖、paused direct access 上报、sysadmin 漏斗摘要重试成功指标，以及第 8-9 轮涉及的实验指标口径是否真正闭环。

关联文档：[`./ai-image-generation-audit-01.md`](./ai-image-generation-audit-01.md)、[`./ai-image-generation-audit-02.md`](./ai-image-generation-audit-02.md)、[`./ai-image-generation-audit-03.md`](./ai-image-generation-audit-03.md)、[`./ai-image-generation-audit-04.md`](./ai-image-generation-audit-04.md)、[`./ai-image-generation-audit-05.md`](./ai-image-generation-audit-05.md)、[`./ai-image-generation-audit-06.md`](./ai-image-generation-audit-06.md)、[`./ai-image-generation-audit-07.md`](./ai-image-generation-audit-07.md)、[`./ai-image-generation-audit-08.md`](./ai-image-generation-audit-08.md)、[`./ai-image-generation-audit-09.md`](./ai-image-generation-audit-09.md)、[`../design-docs/ai-image-generation-page.md`](../design-docs/ai-image-generation-page.md)

## 结论

第 9 轮提出的三项 P2 已基本修复：

- 清除手动覆盖时不再删除 assignment 行，而是保留行并改为 `manualOverride: false`；paused A/B 下用户不会掉回 parallel。
- `isDirectGenerationAccess()` 已覆盖 `paused + ab_test`，页面打开和提交在 paused 期间能使用同一套 direct access 判断。
- sysadmin 漏斗摘要已抽成纯函数，并新增 `retrySucceeded` 与 `retrySuccessRate`，配套前端单测已覆盖。

当前没有类型检查、测试或构建阻断。但 direct access 口径还没有完全闭环：默认指标聚合只排除了 direct access 的生成提交/成功/失败，仍会把 direct access 的页面打开、案例选择、助手启动、Prompt 回填等 UX 事件计入被分配 variant 的主指标。也就是说，直达另一路由的用户不会污染生成提交率的分子，却仍会污染打开数和前置行为指标；sysadmin 漏斗摘要中的 `opened` 和若后续展示 prompt/assistant 转化，仍不能完全代表“按分配入口体验”的主漏斗。

## 验证结果

| 命令 / 检查      | 结果                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` | 通过：server `tsc --noEmit`、web `vue-tsc --noEmit` 均完成。                                                                |
| `pnpm lint`      | 通过。                                                                                                                      |
| `pnpm test`      | 通过：server 14 个测试文件 / 73 条测试；web 23 个测试文件 / 77 条测试。                                                     |
| `pnpm build`     | 通过：web production build 成功，server `wrangler deploy --dry-run --outdir dist` 成功；dry-run 输出包含 `env.AI` binding。 |

说明：本轮仍未启动浏览器视觉复测，也未连接 staging/production Workers AI 验证真实 JSON 输出稳定性。

## 关键缺陷

### P2：direct access 的非生成类事件仍进入默认主指标，opened 与前置转化会被污染

位置：`server/src/lib/experiments.ts` 615-655；`web/src/components/layout/generationExperimentEvents.ts` 60-79；`web/src/views/ai-image/AiImageGeneration.vue` 51-60、111-116；`web/src/views/ai-image/PromptAssistantPanel.vue` 89-95；`web/src/views/sysadmin/generationExperimentMetricsSummary.ts` 21-49

第 8-9 轮已经把 direct access 的 `generate_submitted` / `generate_succeeded` / `generate_failed` 从默认漏斗中排除：

```ts
if (isGenerateMetricEventName(eventName) && metadata.directAccess === true) {
  return false;
}
```

但 `generation_page_opened` 不在 `isGenerateMetricEventName()` 中，因此 direct access 页面打开仍会进入默认指标。前端确实会在页面打开 metadata 中带 `directAccess: true`，并额外上报 `variant_switched_directly`，但聚合层没有排除或拆分 direct access 的 `generation_page_opened`。

典型场景：

1. 用户被分配到 B，导航主入口是 `/ai-image`。
2. 用户手动访问 `/workspace`。
3. 前端上报 `generation_page_opened`，metadata 为 `{ variant: "A", directAccess: true }`，服务端按当前 attribution 把事件归到 B。
4. 默认 metrics 仍统计 `{ variant: "B", eventName: "generation_page_opened" }`。
5. 用户在 `/workspace` 生成时，提交/成功会因为 `directAccess: true` 被排除。

结果是 sysadmin 摘要里 B 的 `opened` 增加了，但 B 的 `submitted` / `succeeded` 不增加；提交率被直达旧页面的行为拉低。paused A/B 的直达判断已修复后，这个问题在 paused 和 running 都会稳定出现，只是现在 direct access 计数会同时增加。

同类污染还会出现在 `/ai-image` 的前置 UX 事件上：`prompt_case_selected`、`assistant_started`、`assistant_prompt_filled` 当前没有携带 `directAccess` metadata。若 A 用户直达 `/ai-image` 并使用案例/助手，这些事件会按 A variant 进入默认指标，后续如果 sysadmin 页面展示“案例选择率 / 助手启动率 / Prompt 回填率”，仍会把直达 B 页面行为算进 A 变体。

真实影响：

- 当前 `opened -> submitted` 主漏斗分母仍可能被直达行为污染。
- direct access 计数只能提示发生过直达，但不能保证主指标已剔除直达路径。
- 如果灰度期间老用户大量手动直达旧 `/workspace`，B 变体提交率可能被错误拉低；如果 A 用户尝试新版 `/ai-image`，A 变体的案例/助手指标可能被错误抬高。

建议：

- 聚合层对所有默认主漏斗事件统一处理 `metadata.directAccess === true`，至少排除 `generation_page_opened`、`prompt_case_selected`、`assistant_started`、`assistant_prompt_filled`。
- 或把 direct access 事件单独派生成 `direct_generation_page_opened`、`direct_prompt_case_selected` 等，不混入主事件名。
- 前端在 `/ai-image` 的案例选择、助手启动、Prompt 回填事件 metadata 中也带上 `directAccess`；服务端可按 route vs assigned variant 兜底，避免旧客户端漏传。
- 补集成测试：direct access 页面打开不应增加默认 `generation_page_opened`；direct access AI 助手/案例事件不应进入主变体前置指标，或应进入 direct\_\* 指标。

## 第 9 轮修复复核

| 项目                        | 复核结果                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 清除手动覆盖保留 assignment | 已修复。`clearGenerationExperimentAssignmentOverride()` 更新现有行，保留非手工 assignment；新增测试覆盖 paused 后清除覆盖仍保持 B。 |
| paused A/B direct access    | 已修复。`isDirectGenerationAccess()` 对 `paused + ab_test` 也按 `navTarget !== targetRoute` 判断；单测覆盖 paused 直达另一路由。    |
| 重试成功摘要                | 已修复。`generationExperimentMetricsSummary.ts` 计算 `retrySucceeded` 和 `retrySuccessRate`；sysadmin 表格展示对应列；单测覆盖。    |
| Workers AI 类型与构建       | 保持通过。`pnpm build` dry-run 仍显示 `env.AI` binding。                                                                            |
| 案例分类排序                | 保持稳定。产品顺序优先，自定义分类固定 `zh-CN` 排序。                                                                               |

## 残余风险

| 项目                 | 现状                                                   | 风险                                                                                                          | 建议                                                                                                    |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 浏览器视觉复测       | 尚未执行                                               | sysadmin 实验页表格已扩到 11 列，窄屏滚动与布局需要肉眼确认                                                   | 启动本地 dev server，用桌面和移动宽度复测 `/sysadmin/experiments/generation`、`/ai-image`、`/workspace` |
| 真实 Workers AI 联调 | 尚未执行                                               | Prompt 助手真实 JSON 输出、延迟、降级率仍未知                                                                 | 在 staging/production 记录 JSON parse 失败率、降级率、平均耗时                                          |
| 手动覆盖恢复语义     | 清除覆盖会按当前实验 traffic + salt 计算非手工 variant | 若 sysadmin 在 paused 期间同时改 traffic，再清除覆盖，用户可能按新 traffic 恢复，而不是恢复覆盖前的旧普通分配 | 如果运维期望“恢复到覆盖前分配”，需要额外保存覆盖前 variant；当前实现可接受但应在操作说明里明确          |

## 建议修复顺序

1. 统一 direct access 主指标口径：默认主漏斗排除所有 `directAccess: true` 的主事件，或派生成 direct\_\* 事件单独展示。
2. 给 `/ai-image` 的案例选择、助手启动、Prompt 回填补 directAccess metadata，并在服务端做 route vs assignment 的兜底。
3. 补 direct access 页面打开和前置 UX 事件的聚合测试。
4. 做浏览器视觉复测，尤其是 sysadmin 11 列漏斗摘要表。
5. 做真实 Workers AI 联调并记录验收数据。

## 发布建议

当前代码质量和自动化验证已明显好转，没有 P1 阻断；可以继续内部试用和 sysadmin 排障。但如果要用 `/sysadmin/experiments/generation` 的漏斗摘要指导普通用户灰度扩量，建议先修复 direct access 的非生成类事件污染，否则打开数、案例/助手前置指标与提交/成功指标不在同一口径下，容易误判 A/B 转化。
