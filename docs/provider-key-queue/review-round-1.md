# Review Round 1 — 功能完整性

**日期**: 2026-05-13
**视角**: 功能完整性
**审核范围**: Provider key group、队列调度、admin/user 并发配置、配置 UI 与文档
**关联需求**: [`requirements.md`](./requirements.md)
**关联任务**: [`tasks.md`](./tasks.md)

---

## 审核清单

- [x] 对照 F1-F6 检查后端 API、调度器、恢复、权限和 UI 是否覆盖。
- [x] 搜索旧 `providerKeyId` / `user_provider_keys` 使用点，确认新生成入口以 key group 为准。
- [x] Browser 验证 sysadmin key group 页面与 admin/user 创建表单。
- [x] 运行相关 server/web 类型检查和测试。

---

## 发现

### P0

无。

### P1

#### Finding #1: Provider key 列表缺少当前 slot 占用展示

- **位置**: `server/src/routes/sysadmin/providerKeys.ts`, `web/src/views/sysadmin/Keys.vue`
- **现象**: 需求 F1 要求 provider key 列表返回 `maxConcurrency` 和当前运行占用统计；实现只返回并展示最大并发。
- **影响**: sysadmin 无法在配置页判断某个 key 是否接近阈值，排障和容量调整不完整。
- **修复**: provider key 列表左连 tasks，按 `queued/running + assigned_at` 统计 `activeSlots`；UI 显示 `activeSlots / maxConcurrency`；OpenAPI schema 同步。

### P2

无。

---

## 修复

| Finding | 状态 | 备注                              |
| ------- | ---- | --------------------------------- |
| #1      | ✅   | 已补 `activeSlots` API/UI/OpenAPI |

---

## 修复后验证

- [x] `pnpm -F server typecheck`
- [x] `pnpm -F web typecheck`
- [x] `pnpm -F server test -- queueScheduler.test.ts apiPermissions.test.ts`
- [x] `pnpm -F web test -- useSysadminKeysController.test.ts providerKeyQueueI18n.test.ts`

---

## 下一轮关注点

Round 2 重点看类型与静态分析：特别是 nullable provider/group 字段、SQL 聚合类型、前端 API 类型和旧单 key 兼容路径。

---

## 总结

本轮发现 1 个 P1 功能缺口，已修复。核心旅程已覆盖：sysadmin 管理 key/group，分配 admin group，admin 管 user 并发，生成任务按 group/key slot 入队调度。
