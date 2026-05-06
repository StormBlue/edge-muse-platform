# 内部演示脚本

面向已能启动本地栈的贡献者；**发布前机械验收**以 [`ACCEPTANCE.md`](./ACCEPTANCE.md) 与 `pnpm test` 等命令为准。

## 准备

1. 按根目录 [`README.md`](../README.md) 配置 `server/.dev.vars` 并执行 `pnpm install`、`pnpm -F server types`、`pnpm -F server db:migrate:local`、`pnpm -F server seed:local`（若库为空）。
2. `pnpm dev`（或分别 `pnpm dev:web` / `pnpm dev:server`）。
3. 打开 `http://localhost:5173`，使用 README 中的本地默认 **sysadmin** 账号登录（本地 dev 通常不强制 Turnstile）。

## 建议演示路径（约 10–15 分钟）

| 步骤 | 操作                                                         | 预期                                                                                                              |
| ---- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1    | 以 sysadmin 登录                                             | 侧栏可见工作台、AI 图像、历史、系统管理                                                                           |
| 2    | 打开 **系统管理 → 生成入口**（`/sysadmin/generation-entry`） | 可开关普通用户对工作台 / AI 图像页的可见性；可看到用量摘要（有事件后）                                            |
| 3    | 普通用户视角                                                 | 用 admin 再建一个 **user** 账号登出重登，或临时关入口验证侧栏变化（与 [`EXPERIMENTS.md`](./EXPERIMENTS.md) 一致） |
| 4    | **AI 图像生成**（`/ai-image`）                               | 可选案例、Prompt 助手（若已配置 AI）、提交生成；任务经 WebSocket 更新                                             |
| 5    | **工作台**（`/workspace`）                                   | 文生图/图生图、尺寸与张数受 `providerCapabilities` 约束                                                           |
| 6    | **历史**（`/history`）                                       | 会话检索与排序正常                                                                                                |
| 7    | **管理端**（admin）                                          | 用户、配额相关能力（按需演示）                                                                                    |
| 8    | **API 文档**                                                 | `http://localhost:8787/api/docs` 可打开；OpenAPI JSON `http://localhost:8787/api/openapi.json`                    |

## 相关文档

- [`USER_GUIDE.md`](./USER_GUIDE.md) — 终端用户说明
- [`OPERATIONS.md`](./OPERATIONS.md) — 运维与排障
- [`EXPERIMENTS.md`](./EXPERIMENTS.md) — 生成入口与事件
