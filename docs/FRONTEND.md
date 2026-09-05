# 前端（Vue 3）

SPA 位于 [`web/`](../web/)，构建产物由 Worker 以静态资源形式提供。

## 入口与全局

| 文件                                                    | 职责                            |
| ------------------------------------------------------- | ------------------------------- |
| [`web/src/main.ts`](../web/src/main.ts)                 | 创建应用、Pinia、i18n、全局样式 |
| [`web/src/App.vue`](../web/src/App.vue)                 | 根布局                          |
| [`web/src/router/index.ts`](../web/src/router/index.ts) | 路由与导航守卫                  |

## 双入口与 UI 产品线

本节描述当前实现；早期页面背景见 [`design-docs/ai-image-generation-page.md`](./design-docs/ai-image-generation-page.md)，其中案例首页等旧布局不再代表当前入口。

- **专业工作台**：[`/workspace`](../web/src/views/workspace/Workspace.vue) — 完整模式、尺寸、参考图、张数与生成目标组合；沿用会话与 WebSocket 管线。
- **AI 图像生成**：[`/ai-image`](../web/src/views/ai-image/AiImageGeneration.vue) 默认直接打开创作器。编辑器、按需案例选择器与 AI 助手共享同一创作状态；结果区支持参数复用、作为参考图继续创作与双图对比，提交仍进入同一套 `/api/generate` 管线。
- **侧边栏与默认落地页**：普通用户可见项由 **`generationEntry`**（`/api/me`）与 sysadmin [`/sysadmin/generation-entry`](../web/src/views/sysadmin/) 配置；详见 [`EXPERIMENTS.md`](./EXPERIMENTS.md)。sysadmin 始终可见两入口以便验收。

运行时行为以代码与 EXPERIMENTS 为准；不包含历史文档中的「按用户哈希的流量百分比 A/B」模型。

### AI 图像创作器与助手

[`useImageStudio.ts`](../web/src/views/ai-image/useImageStudio.ts) 拥有编辑状态、当前任务、来源任务与对比图片；[`studioContext.ts`](../web/src/views/ai-image/studioContext.ts) 将同一控制器提供给 `StudioEditor`、`StudioResults` 与 `StudioCasePicker`。创作器不借用工作台的 `currentSessionId`；查看任务不会自动替换尚未提交的提示词。

- 模式、尺寸、参考图上限、张数与并发限制来自账号及生成目标能力。创作需求可整理主体、用途、风格、必须保留和希望修改的内容，显式加入提示词或作为助手上下文。
- 助手返回内容先进入审阅区，展示请求时原文与可编辑建议；用户可采纳整段或勾选段落追加到当前提示词。采纳只修改提示词，保留用户选定的画幅；建议不会自动填入或触发生成。若等待期间当前提示词已改变，整段替换需再次确认。创作器支持撤销上一次提示词替换。
- 沿用参数与作为参考图只预填表单，仍需用户提交。已生成图片直接使用本人图片 ID，无需重新上传；模型、尺寸、模式与张数按当前能力重新校验或回退并提示。原配方引用的图片缺失时阻止图生图提交，直到补足参考图、明确确认使用当前参考图或切换文生图；图生图始终至少需要一张参考图。
- 账号切换会清空提示词、撤销、创作需求、参考图、来源与预览，并使旧请求失效。详情和全局轮询交错返回时，旧排队或运行快照不能覆盖终态。未提交内容只保留在当前页面内存，不做草稿持久化或跨设备同步。

### 案例按需加载

`/ai-image` 的案例库由 [`useAiImageCases`](../web/src/views/ai-image/useAiImageCases.ts) 管理：

- 打开案例选择器后才请求 `GET /api/prompt-cases?limit=60` 的轻量列表项，默认编辑器首屏不请求案例列表；列表项不包含 `promptTemplate`。
- 选择器提供分类与搜索；筛选与 locale 变化重置 cursor。底层案例控制器仍支持模式、尺寸筛选，选项来自服务端 `facets`，不能从当前页推导全局选项。
- “加载更多”通过 `pageInfo.nextCursor` 追加下一页，并对重复 id 做前端去重。
- 用户预览或应用案例时会按需调用 `GET /api/prompt-cases/:id`，完整详情按 id 缓存；应用 prompt、Prompt 助手上下文和案例大图预览只使用已加载的完整详情。
- 案例缩略图组件使用浏览器原生 `loading="lazy"` 与 `decoding="async"`，避免不可见卡片图片立即全量加载。

### 导航与异步状态

- 历史与会话审计通过 query 中的 `session` 打开详情，保留列表页码、搜索与排序等已有参数。列表进入详情使用 `push` 并记录列表来源；详情的返回按钮通过浏览器 `back` 回到来源，避免反复产生“列表 → 详情 → 列表”的历史记录。直接打开详情链接时没有列表来源，返回使用 `replace`。共同逻辑见 [`listDetailNavigation.ts`](../web/src/lib/listDetailNavigation.ts)。
- 历史与审计列表请求失败时显示错误与重试操作；详情请求失败会提示原因并替换回列表，历史会话删除后也替换回列表。路由变化后的迟到响应不能覆盖当前详情或将用户带回旧页面。
- AI 图像页 `/ai-image` 与 `/ai-image?mode=blank` 均进入编辑器；`/ai-image/cases/:caseId` 应用案例，`?task=:id` 查看任务，`?sourceTask=:id&reuse=params|reference&image=:imageId` 预填再创作。URL 只携带来源标识，任务与图片重新鉴权读取；浏览器前进后退遵循 URL，刷新不恢复未提交草稿。同一案例在页内往返保留已编辑提示词。
- 工作台明确的 `/workspace/s/:sessionId` 优先加载指定会话，即使另一个会话有运行任务也不自动跳走；指定会话正在运行时连接其任务 WebSocket。只有未指定会话的入口才为普通用户恢复活动任务，sysadmin 不自动选择某个活动任务。新建与提交仍遵循运行任务和单次任务约束。
- [`session.ts`](../web/src/stores/session.ts) 对消息首屏与分页响应校验请求版本及会话 id；切换、新建、清空草稿与卸载会使旧加载失效。旧分页请求的清理不能重置新分页请求的 loading 状态。工作台自身也校验路由请求版本，防止旧恢复请求触发导航。

### 全局任务中心

[`taskActivity.ts`](../web/src/stores/taskActivity.ts) 与 [`TaskCenter.vue`](../web/src/components/tasks/TaskCenter.vue) 在应用壳中展示本人最近及进行中的任务。登录且页面可见时轮询：有任务约每 5 秒，空闲约每 30 秒；隐藏时停止调度，恢复可见时刷新。生成和重试成功会立即登记任务，避免快速完成任务漏掉通知；通知为应用内提示，不是系统推送。

列表展示真实阶段、提交时间、耗时、预扣与退款；终态再展示净消耗。取消只适用于服务端仍为 queued 的任务，竞态由服务端决定，前端随后重新读取状态和额度。请求失败保留上次快照并提供重试；账号切换使旧响应及通知失效。全局轮询只合并当前页面已经选中的任务，不自动跳转会话。

### 响应式应用壳

- [`AppShell.vue`](../web/src/components/layout/AppShell.vue) 在桌面提供可折叠侧栏，手机提供主要入口与“更多”抽屉；可见项仍遵循账号角色和生成入口配置。抽屉关闭时不可聚焦，打开后管理焦点，支持 Escape 关闭并恢复焦点。
- 手机底部导航与正文留白包含设备安全区域，避免遮挡底部操作。应用壳的正文使用独立滚动区；[`usePageScroll.ts`](../web/src/components/layout/usePageScroll.ts) 按用户与完整路由在内存中保存位置，返回同一路由时随内容加载恢复。不同 query 有独立位置，刷新浏览器不保证保留该内存记录。
- 工作台和 AI 图像页根据侧栏之外的可用容器宽度选择多栏及限高布局；空间不足时纵向滚动，不能仅因 viewport 达到桌面断点就裁切堆叠内容。响应式验收应覆盖 3840×2160、1920×1080、1366×768 及手机 H5，另检查侧栏展开/折叠与中间宽度。
- 创作器宽屏并排显示编辑与结果；手机通过「创作 / 结果」切换，隐藏面板仍保留当前页面状态。案例使用按需对话框，预览不会改变创作上下文。结果对比在窄屏仍并排显示两张完整比例的图片，可分别打开大图。
- 历史与会话审计列表使用自适应列数，宽屏增加可见项目数。用户管理表格在窄屏隐藏次要统计，保留身份、状态与操作入口；编辑、配额、密码、启停与详情集中在每行的省略号菜单，完整信息可进入详情查看。

### 个人设置

[`SettingsLayout.vue`](../web/src/views/settings/SettingsLayout.vue) 提供个人资料与安全设置的真实路由链接，当前页具有 `aria-current`。两个表单均有关联 label、自动填充语义、保存中禁用与重复提交保护，以及可访问的错误/成功状态；昵称长度为 1–40，新密码至少 8 位，与后端校验一致。密码修改失败保留输入以便重试，成功后清空。

## Pinia 与全局状态

| Store                                                                 | 用途                                                              |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`web/src/stores/auth.ts`](../web/src/stores/auth.ts)                 | 登录态、用户 profile、`providerCapabilities`、`generationTargets` |
| [`web/src/stores/session.ts`](../web/src/stores/session.ts)           | 当前会话列表、消息、乐观更新与 WebSocket 事件合并                 |
| [`web/src/stores/taskActivity.ts`](../web/src/stores/taskActivity.ts) | 跨页面任务观察、最近任务分页、取消及额度刷新、应用内完成通知      |
| [`web/src/stores/ui.ts`](../web/src/stores/ui.ts)                     | UI 偏好（主题等）                                                 |

## 主要视图

| 路径前缀  | 文件                                                                                      | 说明                                          |
| --------- | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| AI 生图页 | [`views/ai-image/AiImageGeneration.vue`](../web/src/views/ai-image/AiImageGeneration.vue) | 普通用户新入口；与实验 `navTarget` 对齐       |
| 工作台    | [`views/workspace/Workspace.vue`](../web/src/views/workspace/Workspace.vue)               | 经典生图主界面；按 provider 能力过滤模式/尺寸 |
| 历史      | [`views/history/History.vue`](../web/src/views/history/History.vue)                       | 会话搜索与排序                                |
| 登录      | [`views/auth/Login.vue`](../web/src/views/auth/Login.vue)                                 | 地区化验证码 + 表单                           |
| 管理      | [`views/admin/UserList.vue`](../web/src/views/admin/UserList.vue)                         | 管理员：用户与配额                            |
| 系统管理  | [`views/sysadmin/*.vue`](../web/src/views/sysadmin/)                                      | 看板、密钥、生成实验配置、案例库、会话审计等  |

## 关键组件

- **输入与参数**：[`web/src/components/chat/ChatInput.vue`](../web/src/components/chat/ChatInput.vue) — 生成目标、尺寸选项与参考图上限来自 store 中的能力快照。
- **消息与看图**：[`ChatMessage.vue`](../web/src/components/chat/ChatMessage.vue)、[`ImageMessage.vue`](../web/src/components/chat/ImageMessage.vue)、[`ImageViewer.vue`](../web/src/components/image/ImageViewer.vue)。
- **实时任务**：[`web/src/composables/useTaskWebSocket.ts`](../web/src/composables/useTaskWebSocket.ts)，精简任务 API 见 [`web/src/api/tasks.ts`](../web/src/api/tasks.ts)。
- **图片再创作**：[`useImageRecreation.ts`](../web/src/components/image/useImageRecreation.ts) 根据开放入口进入 AI 创作器或工作台，传递来源标识，不自动提交。

## API 客户端

[`web/src/api/client.ts`](../web/src/api/client.ts) — 统一处理 base URL、Cookie、CSRF 头与错误解析。

## 相关文档

- [`DESIGN.md`](./DESIGN.md) — 前后端共同约定
- [`design-docs/ai-image-generation-page.md`](./design-docs/ai-image-generation-page.md) — AI 图像页背景、信息架构与非目标边界
- [`API.md`](./API.md) — 后端契约
- [`EXPERIMENTS.md`](./EXPERIMENTS.md) — `generationEntry`、导航与 `POST /api/generation/events`
- [`USER_GUIDE.md`](./USER_GUIDE.md) — 功能层说明
