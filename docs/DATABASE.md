# 数据库（D1）

Edge Muse 使用 **Cloudflare D1**（SQLite）存储平台状态；Schema 以 **Drizzle ORM** 定义，迁移文件由 drizzle-kit 生成。

## 权威来源

- **表与字段**：[`server/src/db/schema.ts`](../server/src/db/schema.ts)（含中文注释说明关系与软删约定）
- **迁移 SQL**：[`server/db/migrations/`](../server/db/migrations/)
- **客户端**：[`server/src/db/client.ts`](../server/src/db/client.ts)

## 主要实体（概念层）

| 领域      | 表（见 schema 实名）                             | 说明                                                                       |
| --------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| 账号      | `users`                                          | sysadmin / admin / user；`preferred_provider_key_id` 等                    |
| 配额      | `quotas`                                         | 按用户张数配额与扣减                                                       |
| 服务商    | `providers`                                      | `request_format`、`supported_sizes`、内置 catalog 维护                     |
| 密钥      | `provider_keys`                                  | AES-GCM 密文；与 `providers` 外键                                          |
| 绑定      | `user_provider_keys`                             | 用户与密钥行一对一绑定                                                     |
| 会话/消息 | `sessions`, `messages`                           | 工作台上下文与附件 JSON                                                    |
| 任务      | `tasks`                                          | 异步生图状态与 provider 原始响应等                                         |
| 生成入口  | `generation_entry_settings`, `generation_events` | 普通用户可见工作台/AI 图像页开关、漏斗与任务归因事件（最近 30 天用量摘要） |
| 系统设置  | `ai_model_settings`, `captcha_settings`          | Prompt Assistant 模型与国内/国外登录验证码 provider                        |
| 图片      | `image_objects`                                  | R2 对象元数据                                                              |
| 审计      | `audit_logs`                                     | 管理类写操作                                                               |

## 迁移流程

```bash
pnpm -F server db:gen          # 改 schema 后生成 SQL
pnpm -F server db:migrate:local
pnpm -F server db:migrate:remote   # 线上，需 Wrangler 凭证
```

生成迁移后应 **人工审阅 SQL** 再提交；线上执行见 [`OPERATIONS.md`](./OPERATIONS.md)。

## 备份与清理

- 运维快照与表大小日志见 [`server/src/lib/operations.ts`](../server/src/lib/operations.ts) 及 cron 说明（[`RELIABILITY.md`](./RELIABILITY.md)）。
- 软删与 R2 清理见 [`server/src/lib/cleanup.ts`](../server/src/lib/cleanup.ts)。

## 相关文档

- [`EXPERIMENTS.md`](./EXPERIMENTS.md) — 生成实验与事件的代码入口
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — 数据流概览
- [`SECURITY.md`](./SECURITY.md) — 密钥加密与访问控制
- [`API.md`](./API.md) — 对外暴露的数据形状
