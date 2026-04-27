# 文档索引

面向贡献者与 AI 助手的 `docs/` 入口；根目录另有 [`AGENTS.md`](../AGENTS.md)（~100 行速览）与 [`ARCHITECTURE.md`](../ARCHITECTURE.md)（架构详解）。

## 核心

| 文件                               | 用途                               |
| ---------------------------------- | ---------------------------------- |
| [DESIGN.md](./DESIGN.md)           | 代码组织、命名、错误处理、依赖策略 |
| [API.md](./API.md)                 | HTTP API 清单与错误格式            |
| [DATABASE.md](./DATABASE.md)       | D1 / Drizzle / 迁移                |
| [FRONTEND.md](./FRONTEND.md)       | Vue 3 应用结构                     |
| [SECURITY.md](./SECURITY.md)       | 认证、密钥、数据与威胁边界         |
| [RELIABILITY.md](./RELIABILITY.md) | 任务恢复、cron、备份与降级         |
| [DEPLOYMENT.md](./DEPLOYMENT.md)   | Wrangler、CI/CD、环境              |
| [TESTING.md](./TESTING.md)         | 测试命令与范围                     |

## 运维与产品

| 文件                                   | 用途                       |
| -------------------------------------- | -------------------------- |
| [OPERATIONS.md](./OPERATIONS.md)       | 迁移、密钥轮换、日志、演练 |
| [USER_GUIDE.md](./USER_GUIDE.md)       | 用户侧功能说明             |
| [PRODUCT_SENSE.md](./PRODUCT_SENSE.md) | 角色、旅程、指标           |
| [DEMO.md](./DEMO.md)                   | 内部演示步骤               |
| [ACCEPTANCE.md](./ACCEPTANCE.md)       | 验收清单与验证命令         |

## 质量与历史

| 文件                                           | 用途                         |
| ---------------------------------------------- | ---------------------------- |
| [QUALITY_SCORE.md](./QUALITY_SCORE.md)         | 模块质量与已知债             |
| [design-docs/index.md](./design-docs/index.md) | 设计决策索引                 |
| [archive/README.md](./archive/README.md)       | 已归档 PRD、Cubence 任务全书 |

## 已合并 / 迁移说明

- **安全**：原 `SECURITY_REVIEW.md` 的要点已并入 [`SECURITY.md`](./SECURITY.md)；旧文件改为重定向。
- **架构**：权威内容在根目录 [`ARCHITECTURE.md`](../ARCHITECTURE.md)。
