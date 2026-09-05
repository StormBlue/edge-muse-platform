# 前端（Vue 3）

SPA 位于 [`web/`](../web/)，构建产物由 Worker 以静态资源形式提供。

## 入口与全局

| 文件                                                    | 职责                            |
| ------------------------------------------------------- | ------------------------------- |
| [`web/src/main.ts`](../web/src/main.ts)                 | 创建应用、Pinia、i18n、全局样式 |
| [`web/src/App.vue`](../web/src/App.vue)                 | 根布局                          |
| [`web/src/router/index.ts`](../web/src/router/index.ts) | 路由与导航守卫                  |

## 双入口与 UI 产品线

原单独的「前端 UI 重设计 brief」已收拢到本节与 [`design-docs/ai-image-generation-page.md`](./design-docs/ai-image-generation-page.md)（已实现说明）。

- **专业工作台**：[`/workspace`](../web/src/views/workspace/Workspace.vue) — 完整模式、尺寸、参考图、张数与生成目标组合；沿用会话与 WebSocket 管线。
- **AI 图像生成**：[`/ai-image`](../web/src/views/ai-image/AiImageGeneration.vue) — 普通用户导向：案例、Prompt 助手、再进入同一套 `/api/generate` 任务；授权账号可切换实验生成目标。
- **侧边栏与默认落地页**：普通用户可见项由 **`generationEntry`**（`/api/me`）与 sysadmin [`/sysadmin/generation-entry`](../web/src/views/sysadmin/) 配置；详见 [`EXPERIMENTS.md`](./EXPERIMENTS.md)。sysadmin 始终可见两入口以便验收。

运行时行为以代码与 EXPERIMENTS 为准；不包含历史文档中的「按用户哈希的流量百分比 A/B」模型。

### AI 图像生成案例加载

`/ai-image` 的案例库由 [`useAiImageCases`](../web/src/views/ai-image/useAiImageCases.ts) 管理：

- 首屏只请求 `GET /api/prompt-cases?limit=60` 的轻量列表项，列表项不包含 `promptTemplate`。
- 分类、模式、尺寸、搜索和 locale 切换都会重置 cursor 并重新请求服务端；分类与尺寸按钮来自服务端 `facets`，不再从当前页推导全局选项。
- “加载更多”通过 `pageInfo.nextCursor` 追加下一页，并对重复 id 做前端去重。
- 用户预览或应用案例时会按需调用 `GET /api/prompt-cases/:id`，完整详情按 id 缓存；应用 prompt、Prompt 助手上下文和案例大图预览只使用已加载的完整详情。
- 案例缩略图组件使用浏览器原生 `loading="lazy"` 与 `decoding="async"`，避免不可见卡片图片立即全量加载。

### 导航与异步状态

- 历史与会话审计通过 query 中的 `session` 打开详情，保留列表页码、搜索与排序等已有参数。列表进入详情使用 `push` 并记录列表来源；详情的返回按钮通过浏览器 `back` 回到来源，避免反复产生“列表 → 详情 → 列表”的历史记录。直接打开详情链接时没有列表来源，返回使用 `replace`。共同逻辑见 [`listDetailNavigation.ts`](../web/src/lib/listDetailNavigation.ts)。
- 历史与审计列表请求失败时显示错误与重试操作；详情请求失败会提示原因并替换回列表，历史会话删除后也替换回列表。路由变化后的迟到响应不能覆盖当前详情或将用户带回旧页面。
- AI 图像页的空白创作由 `/ai-image?mode=blank` 表达，浏览器前进、后退与刷新按该 query 恢复页面模式。返回案例库时，有案例库来源则 `back`，直接打开空白模式则 `replace('/ai-image')`；query 表达页面模式，不代表已持久化未提交的提示词。
- 工作台明确的 `/workspace/s/:sessionId` 优先加载指定会话，即使另一个会话有运行任务也不自动跳走；指定会话正在运行时连接其任务 WebSocket。只有未指定会话的入口才为普通用户恢复活动任务，sysadmin 不自动选择某个活动任务。新建与提交仍遵循运行任务和单次任务约束。
- [`session.ts`](../web/src/stores/session.ts) 对消息首屏与分页响应校验请求版本及会话 id；切换、新建、清空草稿与卸载会使旧加载失效。旧分页请求的清理不能重置新分页请求的 loading 状态。工作台自身也校验路由请求版本，防止旧恢复请求触发导航。

### 响应式应用壳

- [`AppShell.vue`](../web/src/components/layout/AppShell.vue) 在桌面提供可折叠侧栏，手机提供主要入口与“更多”抽屉；可见项仍遵循账号角色和生成入口配置。抽屉关闭时不可聚焦，打开后管理焦点，支持 Escape 关闭并恢复焦点。
- 手机底部导航与正文留白包含设备安全区域，避免遮挡底部操作。应用壳的正文使用独立滚动区；[`usePageScroll.ts`](../web/src/components/layout/usePageScroll.ts) 按用户与完整路由在内存中保存位置，返回同一路由时随内容加载恢复。不同 query 有独立位置，刷新浏览器不保证保留该内存记录。
- 工作台和 AI 图像页根据侧栏之外的可用容器宽度选择多栏及限高布局；空间不足时纵向滚动，不能仅因 viewport 达到桌面断点就裁切堆叠内容。响应式验收应覆盖 3840×2160、1920×1080、1366×768 及手机 H5，另检查侧栏展开/折叠与中间宽度。
- 历史与会话审计列表使用自适应列数，宽屏增加可见项目数。用户管理表格在窄屏隐藏次要统计，保留身份、状态与操作入口；编辑、配额、密码、启停与详情集中在每行的省略号菜单，完整信息可进入详情查看。

### 个人设置

[`SettingsLayout.vue`](../web/src/views/settings/SettingsLayout.vue) 提供个人资料与安全设置的真实路由链接，当前页具有 `aria-current`。两个表单均有关联 label、自动填充语义、保存中禁用与重复提交保护，以及可访问的错误/成功状态；昵称长度为 1–40，新密码至少 8 位，与后端校验一致。密码修改失败保留输入以便重试，成功后清空。

## Pinia 与全局状态

| Store                                                       | 用途                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| [`web/src/stores/auth.ts`](../web/src/stores/auth.ts)       | 登录态、用户 profile、`providerCapabilities`、`generationTargets` |
| [`web/src/stores/session.ts`](../web/src/stores/session.ts) | 当前会话列表、消息、乐观更新与 WebSocket 事件合并                 |
| [`web/src/stores/ui.ts`](../web/src/stores/ui.ts)           | UI 偏好（主题等）                                                 |

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
- **实时任务**：[`web/src/composables/useTaskWebSocket.ts`](../web/src/composables/useTaskWebSocket.ts)。

## API 客户端

[`web/src/api/client.ts`](../web/src/api/client.ts) — 统一处理 base URL、Cookie、CSRF 头与错误解析。

## 相关文档

- [`DESIGN.md`](./DESIGN.md) — 前后端共同约定
- [`design-docs/ai-image-generation-page.md`](./design-docs/ai-image-generation-page.md) — AI 图像页背景、信息架构与非目标边界
- [`API.md`](./API.md) — 后端契约
- [`EXPERIMENTS.md`](./EXPERIMENTS.md) — `generationEntry`、导航与 `POST /api/generation/events`
- [`USER_GUIDE.md`](./USER_GUIDE.md) — 功能层说明
