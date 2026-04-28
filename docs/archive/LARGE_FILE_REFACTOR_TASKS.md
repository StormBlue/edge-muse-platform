# 超大文件拆分与可维护性优化任务

> **状态**：清单内任务均已勾选完成；本文档自 `docs/LARGE_FILE_REFACTOR_TASKS.md` 迁入归档，仅作历史参考。当前以代码与 [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)、[`DESIGN.md`](../DESIGN.md) 为准。

> 目标：降低单文件职责密度，保持现有 API、路由、页面行为不变；拆分后每个模块应有清晰边界、中文说明和可独立测试/审查的职责。

## 状态说明

- `[ ]` 未开始
- `[~]` 进行中
- `[x]` 已完成
- `[!]` 需要复查或存在风险

## 验收标准

- 外部访问路径、路由注册、Pinia store API、Provider adapter ID 保持兼容。
- 超过 500 行的文件应优先拆到 500 行以下；确实是单一编排职责的文件可保留，但必须补充边界清晰的中文注释。
- 拆分后的模块按职责命名，不引入与现有架构冲突的新抽象。
- 执行并通过：
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `git diff --check`

## 任务清单

### T1. 拆分 `server/src/routes/sysadmin.ts`

- 状态：`[x]`
- 当前问题：
  - 单文件同时承载 provider、provider key、admin、dashboard、user、session audit、preferences 等系统管理员能力。
  - 会话巡查详情和普通历史详情存在相似的图片/任务聚合逻辑，审查成本较高。
- 拆分目标：
  - 保留 `server/src/routes/sysadmin.ts` 作为路由聚合入口。
  - 新增 `server/src/routes/sysadmin/` 子模块，按业务域拆分。
  - 将跨模块复用的审计图片、失败聚合、用户展示字段等类型/helper 放入专用共享模块。
  - 为敏感逻辑补充中文注释：密钥不返回明文、内置 provider 保护、跨用户巡查权限边界。
- 验收点：
  - `/api/sysadmin/*` 路由路径与响应结构不变。
  - sysadmin 权限中间件仍在入口统一执行。

### T2. 拆分 `server/src/routes/sessions.ts`

- 状态：`[x]`
- 当前问题：
  - 普通会话 CRUD、消息分页、历史列表、历史详情、图片聚合 helper 混在同一文件。
- 拆分目标：
  - 保留 `server/src/routes/sessions.ts` 作为 `sessionRoutes`/`historyRoutes` 导出入口。
  - 新增 `server/src/routes/sessions/` 子模块：`sessionCrud`、`messages`、`history`、`historyHelpers`。
  - 将图片附件合并、任务统计、引用图恢复等 helper 从路由处理器中移出。
  - 补充中文注释说明 cursor 方向、历史详情为什么合并 persisted images。
- 验收点：
  - `/api/sessions/*` 与 `/api/history/*` 响应结构不变。
  - 之前“部分成功图片不能被失败态覆盖”的修复逻辑保留。

### T3. 拆分 `web/src/views/workspace/Workspace.vue`

- 状态：`[x]`
- 当前问题：
  - 单组件同时管理会话恢复、WebSocket、提交/重试、Provider 能力、尺寸选择、滚动 observer、图片预览和页面渲染。
- 拆分目标：
  - 保留页面组件负责布局与组合。
  - 新增 composables：工作台模式/尺寸能力、活跃任务恢复、提交与重试、消息滚动定位。
  - 如模板仍过长，再拆出结果预览区、失败提示区或标题栏组件。
  - 补充中文注释说明“单活跃任务恢复”“失败后重试沿用引用图”的业务原因。
- 验收点：
  - 新建会话、刷新恢复、提交、失败重试、图片预览和删除行为不变。

### T4. 拆分 `web/src/views/sysadmin/UserSessions.vue`

- 状态：`[x]`
- 当前问题：
  - 管理端会话巡查同时包含筛选、分页、详情、失败聚合、图片查看和用户下拉。
- 拆分目标：
  - 新增 `useAuditSessions` composable 管理筛选、分页、详情加载。
  - 抽出任务失败分组、耗时格式化、图片标题等纯 helper。
  - 与历史详情页可共享的结果浏览逻辑优先放入通用 composable。
  - 补充中文注释说明失败分组与图片序号展示规则。
- 验收点：
  - `?user=`、`?session=` 路由同步行为不变。
  - 失败详情展示和图片查看不丢字段。
- 本轮补充：
  - `useUserSessionsController` 继续瘦身，附件归一化、图片预览整形、失败分组、失败序号范围、耗时格式化等纯展示逻辑已移入 `userSessionsHelpers.ts`。
  - helper 内补充中文注释，明确部分成功、多图失败折叠和审计预览的字段规则。

### T5. 拆分 `web/src/views/history/History.vue`

- 状态：`[x]`
- 当前问题：
  - 历史列表、详情、任务统计、分页和图片预览集中在单文件。
- 拆分目标：
  - 新增 `useHistorySessions` composable 管理列表、详情和路由同步。
  - 将任务统计、状态 tone、参数展示等 helper 移入共享 history helper。
  - 尽量复用 T4 的结果浏览/图片查看逻辑。
- 验收点：
  - `/history?session=...` 直接打开详情仍可恢复。
  - 历史详情里部分成功图片仍显示。

### T6. 拆分 `web/src/views/admin/UserList.vue`

- 状态：`[x]`
- 当前问题：
  - 管理员用户列表包含创建/编辑/密码/额度/用量多组状态和弹窗。
- 拆分目标：
  - 新增 `useAdminUsers` composable 管理用户列表、密钥列表、额度、用量加载。
  - 抽出创建、编辑、重置密码、额度发放的表单默认值与提交逻辑。
  - 模板过长时拆出用户表格或弹窗组件。
  - 补充中文注释说明管理员只能操作自己管辖用户的权限假设。
- 验收点：
  - 创建用户、编辑用户、停启用、重置密码、额度发放行为不变。
- 本轮补充：
  - 用户详情侧栏已拆为 `AdminUserDetailsAside.vue`，父页面继续负责列表、弹窗和写操作。
  - 表单默认值、Provider Key 展示文案、日期格式化、统计聚合已移入 `adminUserHelpers.ts`，降低控制器职责密度。

### T7. 拆分 `server/src/providers/openai-compatible.ts`

- 状态：`[x]`
- 当前问题：
  - Provider 请求编排、fetch 超时日志、响应图片解析、mock 响应在同一文件。
- 拆分目标：
  - 保留 `OpenAICompatibleProvider` 主类。
  - 新增 parser/fetch/mock 子模块。
  - `parseProviderImages` 继续从原路径可导入，避免测试和其他模块改动过大。
  - 补充中文注释说明 Responses、legacy images、chat fallback 的兼容顺序。
- 验收点：
  - provider 相关测试通过。
  - 日志字段与错误码不变。

### T8. 收敛 `server/src/lib/tasks/run.ts`

- 状态：`[x]`
- 当前问题：
  - 文件超过 500 行，但目前职责主要是“执行单个生图任务”的编排。
- 拆分目标：
  - 仅拆出低风险纯函数：并发策略、失败摘要、单图失败转换。
  - 主流程保留在 `run.ts`，避免过度拆散长事务上下文。
  - 补充中文注释说明任务租约、心跳、部分成功落库、最终失败仍保留图片的关键规则。
- 验收点：
  - 前次修复的部分成功图片保留逻辑不回退。

## 当前超大文件基线

| 文件                                        | 基线行数 | 目标                       |
| ------------------------------------------- | -------: | -------------------------- |
| `web/src/views/workspace/Workspace.vue`     |     1214 | 页面组件收敛到布局与组合   |
| `server/src/routes/sysadmin.ts`             |     1209 | 入口聚合，业务拆到子路由   |
| `web/src/views/sysadmin/UserSessions.vue`   |     1057 | 状态/失败聚合/helper 外移  |
| `web/src/views/admin/UserList.vue`          |      880 | 状态和表单逻辑外移         |
| `web/src/views/history/History.vue`         |      792 | 列表/详情状态外移          |
| `server/src/routes/sessions.ts`             |      774 | 入口聚合，历史/helper 外移 |
| `server/src/providers/openai-compatible.ts` |      554 | 主类 + parser/fetch/mock   |
| `server/src/lib/tasks/run.ts`               |      551 | 保留主编排，纯函数外移     |

## 完成后行数复扫

所有源码文件均已低于 500 行；当前最大文件：

| 文件                                                  | 当前行数 |
| ----------------------------------------------------- | -------: |
| `server/src/lib/tasks/run.ts`                         |      499 |
| `web/src/views/admin/useAdminUsersController.ts`      |      496 |
| `server/src/routes/admin.ts`                          |      483 |
| `web/src/views/admin/UserList.vue`                    |      475 |
| `web/src/views/sysadmin/UserSessions.vue`             |      470 |
| `web/src/views/sysadmin/Keys.vue`                     |      466 |
| `web/src/components/chat/ChatInput.vue`               |      448 |
| `web/src/views/history/History.vue`                   |      442 |
| `web/src/views/sysadmin/useUserSessionsController.ts` |      418 |
| `web/src/views/workspace/useWorkspaceController.ts`   |      410 |
