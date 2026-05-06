# 前端（Vue 3）

SPA 位于 [`web/`](../web/)，构建产物由 Worker 以静态资源形式提供。

## 入口与全局

| 文件                                                    | 职责                            |
| ------------------------------------------------------- | ------------------------------- |
| [`web/src/main.ts`](../web/src/main.ts)                 | 创建应用、Pinia、i18n、全局样式 |
| [`web/src/App.vue`](../web/src/App.vue)                 | 根布局                          |
| [`web/src/router/index.ts`](../web/src/router/index.ts) | 路由与导航守卫                  |

## 状态

| Store                                                       | 用途                                              |
| ----------------------------------------------------------- | ------------------------------------------------- |
| [`web/src/stores/auth.ts`](../web/src/stores/auth.ts)       | 登录态、用户 profile、`providerCapabilities`      |
| [`web/src/stores/session.ts`](../web/src/stores/session.ts) | 当前会话列表、消息、乐观更新与 WebSocket 事件合并 |
| [`web/src/stores/ui.ts`](../web/src/stores/ui.ts)           | UI 偏好（主题等）                                 |

## 主要视图

| 路径前缀  | 文件                                                                                      | 说明                                          |
| --------- | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| AI 生图页 | [`views/ai-image/AiImageGeneration.vue`](../web/src/views/ai-image/AiImageGeneration.vue) | 普通用户新入口；与实验 `navTarget` 对齐       |
| 工作台    | [`views/workspace/Workspace.vue`](../web/src/views/workspace/Workspace.vue)               | 经典生图主界面；按 provider 能力过滤模式/尺寸 |
| 历史      | [`views/history/History.vue`](../web/src/views/history/History.vue)                       | 会话搜索与排序                                |
| 登录      | [`views/auth/Login.vue`](../web/src/views/auth/Login.vue)                                 | Turnstile + 表单                              |
| 管理      | [`views/admin/UserList.vue`](../web/src/views/admin/UserList.vue)                         | 管理员：用户与配额                            |
| 系统管理  | [`views/sysadmin/*.vue`](../web/src/views/sysadmin/)                                      | 看板、密钥、生成实验配置、案例库、会话审计等  |

## 关键组件

- **输入与参数**：[`web/src/components/chat/ChatInput.vue`](../web/src/components/chat/ChatInput.vue) — 尺寸选项与参考图上限来自 store 中的能力快照。
- **消息与看图**：[`ChatMessage.vue`](../web/src/components/chat/ChatMessage.vue)、[`ImageMessage.vue`](../web/src/components/image/ImageMessage.vue)、[`ImageViewer.vue`](../web/src/components/image/ImageViewer.vue)。
- **实时任务**：[`web/src/composables/useTaskWebSocket.ts`](../web/src/composables/useTaskWebSocket.ts)。

## API 客户端

[`web/src/api/client.ts`](../web/src/api/client.ts) — 统一处理 base URL、Cookie、CSRF 头与错误解析。

## 相关文档

- [`DESIGN.md`](./DESIGN.md) — 前后端共同约定
- [`FRONTEND_UI_REDESIGN_BRIEF.md`](./FRONTEND_UI_REDESIGN_BRIEF.md) — 前端 UI 重设计功能描述
- [`API.md`](./API.md) — 后端契约
- [`EXPERIMENTS.md`](./EXPERIMENTS.md) — `generationEntry`、导航与 `POST /api/generation/events`
- [`USER_GUIDE.md`](./USER_GUIDE.md) — 功能层说明
