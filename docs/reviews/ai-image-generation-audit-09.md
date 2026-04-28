# AI 图像生成开发审核报告 09

审核日期：2026-04-28

审核范围：审核报告 08 修复后的当前工作树，重点复核 Workers AI 类型阻断、A/B 分配重算、direct access 漏斗口径、手动覆盖分配、sysadmin 指标摘要、案例分类排序，以及核心验证命令是否恢复全绿。

关联文档：[`./ai-image-generation-audit-01.md`](./ai-image-generation-audit-01.md)、[`./ai-image-generation-audit-02.md`](./ai-image-generation-audit-02.md)、[`./ai-image-generation-audit-03.md`](./ai-image-generation-audit-03.md)、[`./ai-image-generation-audit-04.md`](./ai-image-generation-audit-04.md)、[`./ai-image-generation-audit-05.md`](./ai-image-generation-audit-05.md)、[`./ai-image-generation-audit-06.md`](./ai-image-generation-audit-06.md)、[`./ai-image-generation-audit-07.md`](./ai-image-generation-audit-07.md)、[`./ai-image-generation-audit-08.md`](./ai-image-generation-audit-08.md)、[`../design-docs/ai-image-generation-page.md`](../design-docs/ai-image-generation-page.md)

## 结论

第 8 轮列出的 P1 阻断已解除：`Cloudflare.Env` 已声明 `AI` binding，`pnpm typecheck` 与 `pnpm build` 均通过；A/B running 状态下的非手工 assignment 会按当前 traffic + salt 重新计算；direct access 生成提交会被前端标记且服务端按 route 兜底标记，默认生成漏斗不再统计直达另一路由后的提交/终态；案例分类也固定为产品顺序。

当前仍有两个会影响实验口径的 P2 边界：一是“移除手动覆盖”直接删除 assignment 行，在 paused A/B 下会让原本应保持分配的用户掉回 parallel；二是前端 direct access 判断只在 `running` 时生效，但 paused A/B 仍会保留既有用户的单入口导航，因此 paused 期间直达另一路由的页面打开事件不会被标记为 direct access，会污染 opened 指标并拉低提交率。另有一个指标摘要缺口：sysadmin 漏斗摘要展示了重试提交率，但没有展示重试成功数/成功率。

综合建议：当前可继续 sysadmin/admin 内部试用，不建议直接把实验页摘要作为生产扩量依据；先修复 paused + 手动覆盖/direct access 这两个口径问题，再做一次浏览器复测和真实 Workers AI 联调记录。

## 验证结果

| 命令 / 检查        | 结果                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`   | 通过：server `tsc --noEmit`、web `vue-tsc --noEmit` 均完成。                                                                |
| `pnpm lint`        | 通过。                                                                                                                      |
| `pnpm test`        | 通过：server 14 个测试文件 / 72 条测试；web 22 个测试文件 / 76 条测试。                                                     |
| `pnpm build`       | 通过：web production build 成功，server `wrangler deploy --dry-run --outdir dist` 成功；dry-run 输出包含 `env.AI` binding。 |
| `git diff --check` | 通过，无空白错误。                                                                                                          |

说明：本轮未启动浏览器视觉复测，未连接 staging/production Workers AI 进行真实模型 JSON 输出联调。

## 关键缺陷

### P2：移除手动覆盖会删除 assignment 行，paused A/B 下破坏“保持既有用户分配”

位置：`server/src/lib/experiments.ts` 196-203、274-287；`web/src/views/sysadmin/GenerationExperiment.vue` 384-456

第 8 轮补了手动覆盖 API/UI，`manualOverride` 现在能强制用户进入 A 或 B。问题出在清除覆盖：`clearGenerationExperimentAssignmentOverride()` 对手动覆盖行执行 `delete`：

```ts
const existing = await findExistingAssignmentRow(env, userId);
if (!existing?.manualOverride) return false;
await getDb(env).delete(experimentAssignments).where(eq(experimentAssignments.id, existing.id));
```

这会把“分配行”与“覆盖状态”一起删除。典型风险路径：

1. 用户 `usr_1` 在 running A/B 中已有普通哈希分配，例如 B。
2. sysadmin 为排障把 `usr_1` 手动覆盖到 A。
3. 实验切到 paused；设计要求 paused 后保持既有用户分配，但不再新增分配。
4. sysadmin 点击“移除覆盖”。
5. 当前实现删除整行 assignment；随后 `getGenerationExperienceForUser()` 在 paused + ab_test 下找不到 existing assignment，于是返回 parallel。

真实影响：

- “移除覆盖”从用户理解上是恢复普通 A/B 分配，但实际会清除分配身份。
- paused 状态下，这个用户不再保持 A/B 单入口，而是变成 parallel 双入口，违背设计文档“暂停实验后保持既有用户分配”的语义。
- 实验页手动覆盖功能用于定向排障时，清除覆盖可能意外改变用户入口，影响灰度观测和复现。

建议：

- 清除覆盖不要直接删除 assignment 行；应将 `manualOverride` 置为 `false`，并恢复普通哈希 variant。
- running 状态可以按当前 `trafficPercent + salt` 重新计算 variant；paused 状态也应在显式清除覆盖时保留一条非手工 assignment，避免用户掉回 parallel。
- 增加集成测试：用户已有 assignment -> 手动覆盖 -> pause -> clear override 后仍保持 A/B 分配，而不是 parallel。

### P2：paused A/B 仍保留单入口导航，但 direct access 前端判断只认 running

位置：`web/src/components/layout/generationExperimentEvents.ts` 87-97；`server/src/lib/experiments.ts` 274-287、637-650

`getGenerationExperienceForUser()` 在 paused + ab_test 下会读取 existing assignment，并返回 A/B 单入口体验。这符合“暂停实验后保持既有用户分配”。但前端 direct access 判断写成：

```ts
if (!experience || experience.status !== "running") return false;
```

因此 paused 期间，已分配 B 的用户如果直接访问 `/workspace`：

- `generation_page_opened` 会记录为普通打开，metadata 里的 `directAccess` 是 false。
- 不会记录 `variant_switched_directly`。
- 服务端生成提交兜底会识别 route 与 assigned variant 不一致，给 `generate_submitted` 标记 `directAccess: true`，并在默认生成漏斗排除。

这会产生口径不一致：页面打开指标被计入 B 的正常 opened，但后续提交/成功被排除，sysadmin 漏斗摘要会看到 B 打开数增加、提交数不增加，提交率被错误拉低，而且 direct access 计数没有同步增加。

建议：

- `isDirectGenerationAccess()` 至少对 `paused + ab_test + variant A/B` 也执行 `navTarget !== targetRoute` 判断。
- 或在服务端对 `generation_page_opened` / `variant_switched_directly` 也做 route vs attribution variant 的兜底标记，并让指标聚合按同一口径处理。
- 补前端单测：paused B 用户直达 `/workspace` 应生成 direct access 事件；paused A 用户直达 `/ai-image` 同理。

### P2：sysadmin 漏斗摘要没有展示重试成功数/成功率，失败重试判断仍需看原始表

位置：`web/src/views/sysadmin/GenerationExperiment.vue` 55-78、316-341；`server/src/lib/experiments.ts` 653-665

后端已经把重试事件派生为 `generate_retry_submitted`、`generate_retry_succeeded`、`generate_retry_failed`，原始指标表也能看到这些事件。但新增的漏斗摘要只取了：

```ts
const retrySubmitted = metricCount(counts, variant, "generate_retry_submitted");
retryRate: formatRate(retrySubmitted, failed);
```

页面摘要展示的是“失败重试率”，没有展示 `generate_retry_succeeded` 和“重试成功率”。这与设计文档中“失败重试”作为核心指标的灰度判断需求仍差一步：sysadmin 能知道失败后有多少人点了重试，但不能在摘要里判断重试是否挽回了失败。

真实影响：

- 失败率升高时，sysadmin 仍需要到原始表里手工找 `generate_retry_succeeded`。
- 如果 B 变体失败多但重试恢复也多，摘要无法表达恢复质量；如果重试提交多但持续失败，摘要也无法明显暴露。

建议：

- 漏斗摘要增加 `retrySucceeded` 和 `retrySuccessRate = generate_retry_succeeded / generate_retry_submitted`。
- 可再增加 `finalSuccess = generate_succeeded + generate_retry_succeeded` 或“失败恢复率”，减少灰度判断时的手工心算。

## 功能缺口 / 残余风险

| 项目                 | 现状                                     | 风险                                                           | 建议                                                                                                   |
| -------------------- | ---------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 浏览器视觉复测       | 本轮只执行了命令行验证                   | sysadmin 实验页新增漏斗摘要和手动覆盖表，可能在小屏或窄列溢出  | 启动本地 dev server，复测 `/sysadmin/experiments/generation`、`/ai-image`、`/workspace` 桌面和移动宽度 |
| 真实 Workers AI 联调 | 本地测试覆盖降级与类型，但未连接真实模型 | JSON 输出格式、延迟、降级率、AI Gateway 配置只能在真实环境验证 | staging 记录 JSON parse 失败率、降级率、平均耗时，并纳入发布检查                                       |
| 手动覆盖可用性       | 当前只支持输入 userId                    | sysadmin 需要先去用户列表复制 ID，误填成本较高                 | 后续可加用户搜索/选择器，并展示当前普通哈希分配用于对比                                                |

## 正向确认

- `env.AI` 类型声明已补齐，`wrangler deploy --dry-run` 输出中也能看到 `env.AI` binding。
- running A/B 非手工 assignment 已按当前 traffic + salt 重算，覆盖了 0% -> 100% 扩量测试。
- 手动覆盖 API/UI 已落地，且 manual override 优先于哈希分配；测试覆盖了设置、列出、清除和重新计算。
- direct access 的生成提交已由前端和服务端双层标记；默认生成漏斗会排除 direct-access 的 submitted/succeeded/failed。
- 公开 `/api/experiments/events` 仍只允许客户端 UX 事件，任务提交和终态事件继续由服务端写入。
- 案例分类按 MVP 产品顺序展示，其余自定义分类使用固定 `zh-CN` 排序。
- 全量 `typecheck`、`lint`、`test`、`build` 均已通过。

## 建议修复顺序

1. 修 `clearGenerationExperimentAssignmentOverride()`：清除覆盖时保留或恢复普通 assignment，补 paused 场景集成测试。
2. 修 paused A/B direct access：前端和/或服务端统一 route 与 assigned variant 的 direct access 口径，补 paused A/B 单测。
3. 补 sysadmin 漏斗摘要的 retry success 指标和测试，避免发布判断仍依赖原始事件表。
4. 启动浏览器复测 sysadmin 实验页、AI 图像生成页和专业工作台。
5. 做 staging Workers AI 联调，记录 Prompt 助手真实输出稳定性。

## 发布建议

当前不再存在类型检查、测试或构建阻断；功能主链路可以继续内部试用。但在进入普通用户生产灰度前，建议先修复 paused + 手动覆盖/direct access 的两处口径问题，否则 sysadmin 在暂停、排障、移除覆盖这些真实运维动作后，实验页面的打开数、direct access 数和提交率会出现不一致，影响扩量判断。
