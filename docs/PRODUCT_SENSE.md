# 产品感知

## 目标用户

- **普通用户**：在配额内使用工作台生图、查看历史与大图。
- **管理员**：创建与管理名下用户、分配配额、重置密码、查看用量。
- **系统管理员**：配置上游密钥、分配管理员、全局看板、会话审计、个人默认服务商偏好。

## 核心旅程

1. Sysadmin 创建 provider key → 绑定 admin/user → 用户登录 → 文生图/图生图。
2. 用户从历史恢复会话，继续多轮任务。
3. 失败任务重试；成功结果从私有 R2 经鉴权接口展示。

## 能力与边界

- **Provider 模式**：当前仅开放文生图与图生图；连续对话模式不再作为生成入口。
- **无自助注册**：获客与开户不在产品自动化范围内。

## 成功标准（工程视角）

- `pnpm typecheck` / `lint` / `test` / `build` 干净。
- 关键路径有可查日志字段（`taskId`、provider endpoint、脱敏错误）。
- 运维可按 [`OPERATIONS.md`](./OPERATIONS.md) 完成密钥与回滚。

## 相关文档

- [`USER_GUIDE.md`](./USER_GUIDE.md)
- [`DEMO.md`](./DEMO.md)
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
