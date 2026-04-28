# AI 图像生成开发审核报告 02

审核日期：2026-04-28  
审核范围：审核报告 01 后的修复集，包含实验暂停语义、实验事件指标、AI 图像页提交链路、案例筛选模式、助手语言、组件级测试与相关文档状态。  
关联文档：[`./ai-image-generation-audit-01.md`](./ai-image-generation-audit-01.md)、[`../exec-plans/ai-image-generation-page-tasks.md`](../exec-plans/ai-image-generation-page-tasks.md)

## 结论

第一轮 P1/P2 修复总体方向正确，自动化验证全部通过，未发现新的类型错误、构建错误或明显的同步提交 bug。实验暂停语义、sysadmin 指标污染、无效生成提交计数、案例模式筛选混用、事件名白名单和助手语言映射已经比审核 01 前明显稳健。

但第二轮仍不建议直接进入普通用户灰度。剩余风险主要集中在“跨异步生命周期的指标归因”和“用户端案例可见性与当前上下文不一致”：任务完成/失败事件仍按事件发生时的当前实验分配归因，可能导致提交与成功率分母分子错位；案例库仍固定中文且未按当前 provider 能力过滤，普通用户可能看到当前服务商无法使用的案例。

## 验证结果

| 命令               | 结果                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `pnpm lint`        | 通过。                                                                                   |
| `pnpm typecheck`   | 通过：server `tsc --noEmit`、web `vue-tsc --noEmit` 均完成。                             |
| `pnpm test`        | 通过：server 14 个测试文件 / 58 条测试，web 16 个测试文件 / 54 条测试。                  |
| `pnpm build`       | 通过：前端 Vite 构建完成，Worker `wrangler deploy --dry-run --outdir dist` 完成。        |
| `git diff --check` | 通过：仅提示 LF 将被 CRLF 替换，无空白错误。                                             |
| 浏览器登录复测     | 未执行：需要向本地登录表单提交 README 默认账号凭据，本轮未把该操作作为报告生成的前置项。 |

## 关键缺陷

### P1：异步任务结果仍可能被归到错误变体

位置：`web/src/views/ai-image/useAiImageGenerationSubmit.ts` 53-70、`server/src/lib/experiments.ts` 182-199

`generate_submitted` 已经改为任务创建成功后上报，这是正确修复。但 `generate_succeeded` / `generate_failed` 仍在 WebSocket 收到 `task.done` / `task.failed` 时单独调用 `trackExperimentEvent()`；服务端 `recordExperimentEvent()` 每次都会重新调用 `getGenerationExperienceForUser()` 计算当前分配。若用户提交任务后 sysadmin 暂停实验、调整 scope、切换 force/ab 策略，或用户分配状态发生变化，完成/失败事件就可能与提交事件落到不同 variant。

影响：

- B 变体提交的任务可能在完成时被记到 `parallel` 或 A。
- 成功率、失败率、任务耗时等后续指标无法可信地按变体闭环。
- A/B 决策会被实验配置变更时段污染，尤其是长耗时生图任务。

建议：

- 在 `generate_submitted` 写入时固化 `{ taskId -> experimentKey, variant, strategy, status }` 快照。
- 任务结果事件按 `taskId` 优先复用提交快照；找不到快照时才回退当前分配，并在 metadata 标注 `attributionFallback: true`。
- 增加集成测试：B 用户提交后暂停实验，`generate_succeeded` 仍应聚合到 B。

### P2：案例库仍固定读取中文，未跟随当前 UI 语言

位置：`web/src/views/ai-image/useAiImageCases.ts` 45-49

助手请求已经按 `ui.locale` 传 `zh-CN` / `en-US`，但用户端案例库仍固定 `listPublishedPromptCases({ locale: "zh-CN" })`。这与需求文档中“用户端读取当前语言可见案例”的设计不一致，也会造成英文 UI 下案例、prompt 模板、归因展示仍是中文。

建议：

- `useAiImageCases()` 读取 `useUiStore().locale`，按当前语言加载案例。
- 监听 locale 变化后重新加载列表，并保留或重置 selection 的规则要明确。
- 增加 `zh-CN` / `en-US` 两种 locale 的组合函数测试。

### P2：案例列表未按当前 provider 能力过滤

位置：`web/src/views/ai-image/useAiImageCases.ts` 36-42、`web/src/views/ai-image/AiImageGeneration.vue` 191-203、`web/src/views/ai-image/AiImagePromptPanel.vue` 130-145

页面会把 `supportedModes` 传给右侧生成面板，生成按钮也会阻止不支持的模式；但左侧案例列表仍展示所有已发布案例。若当前 provider 只支持文生图，用户仍可能选到图生图案例，随后右侧没有对应模式按钮、提交被禁用，形成“案例可见但不可用”的断裂体验。尺寸同理：推荐尺寸不受当前 provider 支持时，页面只会保留已有尺寸而非提示案例不适配。

建议：

- 在 `filterPromptCases()` 或调用层加入 provider capability 过滤：至少按 `supportedModes` 排除完全不可用案例。
- 对推荐尺寸不支持的案例展示“尺寸将自动改为当前服务商可用尺寸”或做降级标记。
- 增加测试：provider 仅支持 `text2image` 时，纯 `image2image` 案例不应进入普通用户列表。

### P2：任务文档把视觉验收标为 DONE，但第二轮变更后未复测

位置：`docs/exec-plans/ai-image-generation-page-tasks.md` 349-357

审核 01 后又修改了提交按钮禁用、案例模式选择、助手 locale、实验事件等用户可见路径，但 AIG-041 仍保持 DONE。本轮自动化覆盖了组件和纯函数，不能替代登录后的 `/ai-image`、sysadmin 案例管理页、sysadmin 实验页视觉复测。文档状态会让后续执行者误以为“修改后的界面已完整复测”。

建议：

- 将 AIG-041 调整为 REVIEW，或新增子项“审核 01 修复后浏览器复测”并标 TODO。
- 浏览器复测完成后记录具体账号角色、页面、视口和关键动作。

### P3：新增测试依赖版本未遵守现有精确锁定风格

位置：`web/package.json` 31-35

项目依赖版本大多是精确版本，新加入的 `@vue/test-utils` 和 `happy-dom` 使用了 `^`。虽然 `pnpm-lock.yaml` 会固定当前解析结果，但 package manifest 风格不一致，后续更新依赖或重装时更容易引入测试环境差异。

建议：

- 改为精确版本，与现有依赖风格一致。
- 在 `docs/TESTING.md` 补充组件测试依赖和 `happy-dom` 使用约定。

## 正向确认

- 审核 01 的 P1/P2 项大多已被代码修正，并有新增单元/集成测试覆盖。
- `generate_submitted` 已改到任务创建成功后上报，避免了无效点击污染提交率。
- 实验事件名已收紧为白名单，并给事件写入接口增加生产限流。
- sysadmin 预览事件默认不进入聚合指标，保留了原始事件留痕。
- 新增组件测试覆盖了案例编辑弹层、导入弹层和表格行级操作，AIG-040 的测试缺口已实质补齐。

## 建议修复顺序

1. 先修任务结果归因：按 `taskId` 复用提交时的变体快照，这是灰度指标可信度的核心。
2. 修用户端案例加载：按 UI locale 和 provider capability 过滤案例。
3. 将 AIG-041 文档状态改为 REVIEW/TODO，完成登录后的浏览器复测再标 DONE。
4. 统一测试依赖版本风格，并补测试文档。
5. 完成后再次运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`，再进入 AIG-042 内部灰度。

## 修复状态

修复日期：2026-04-28

| 项目                 | 状态           | 修复说明                                                                                                                                     |
| -------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 任务结果归因      | 已修复         | `generate_succeeded` / `generate_failed` 按 `taskId` 优先复用 `generate_submitted` 的变体快照；缺失快照时写入 `attributionFallback` 元数据。 |
| P2 案例 locale       | 已修复         | 用户端案例库改为读取 `useUiStore().locale`，并在语言切换后重新加载 published 案例。                                                          |
| P2 provider 能力过滤 | 已修复         | 案例列表、类别/尺寸选项和案例应用逻辑按当前 provider `supportedModes` 过滤；不支持的模式不会进入普通用户可选案例。                           |
| P2 视觉验收文档      | 已修复文档状态 | AIG-041 已调整为 `REVIEW`，新增审核修复后的桌面/移动端浏览器复测待办。                                                                       |
| P3 测试依赖版本      | 已修复         | `@vue/test-utils`、`happy-dom` 改为精确版本，并在测试文档补充组件测试约定。                                                                  |

复测命令均已通过：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`git diff --check`。`git diff --check` 仅输出 Windows 工作区 LF/CRLF 提示，无空白错误。

剩余待办：尚未执行登录后的真实浏览器视觉复测，因此 AIG-041 仍保持 `REVIEW`，不应直接标记为 `DONE`。
