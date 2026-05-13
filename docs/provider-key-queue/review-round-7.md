# Review Round 7 — i18n 与前端回归

**日期**: 2026-05-13
**视角**: 前端类型契约、i18n、残留旧单 key UI
**审核范围**: `web/src/views/admin`、`web/src/views/sysadmin`、`web/src/stores`、`web/src/locales`
**关联需求**: [`requirements.md`](./requirements.md)
**关联任务**: [`tasks.md`](./tasks.md)

---

## 审核清单

- [x] 搜索 `providerKeyId`、`preferredProviderKeyId`、`providerKeyGroupId`、`maxConcurrentTasks` 前端残留。
- [x] 复查 admin 创建普通 user 时不展示 group 选择，sysadmin 才展示 group 选择。
- [x] 复查 sysadmin admins 页面使用 group 与 max concurrent tasks。
- [x] 复查新增中英文 i18n key 存在。
- [x] 已在 Round 5 运行相关前端 i18n/controller 测试。

---

## 发现

### P0

无。

### P1

无。

### P2

无。

---

## 修复

无新增修复。

---

## 修复后验证

- [x] 前端静态搜索确认旧单 key 分配 UI 已移除；sysadmin preference 中的 `preferredProviderKeyId` 属个人偏好，保留合理。
- [x] 新增 i18n key 已由 `providerKeyQueueI18n.test.ts` 覆盖。

---

## 下一轮关注点

Round 8 聚焦性能和查询，重点看 slot 统计、group 列表、恢复扫描是否可利用索引。

---

## 总结

本轮未发现新的前端/i18n 问题。前端生成分配入口已切换为 key group + max concurrent tasks，普通 admin 不能为下属普通用户选择 group。
