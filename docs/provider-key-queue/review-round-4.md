# Review Round 4 — 安全

**日期**: 2026-05-13
**视角**: 权限、密钥脱敏、日志与 SQL 安全
**审核范围**: sysadmin key/key group/admin API、admin user API、provider key 解析与调度日志
**关联需求**: [`requirements.md`](./requirements.md)
**关联任务**: [`tasks.md`](./tasks.md)

---

## 审核清单

- [x] 复查 key group 写接口只在 sysadmin 路由下注册。
- [x] 复查 admin 创建/编辑 user 时不能指定或更改 group。
- [x] 复查 sysadmin 分配 group 会校验 provider/group/key 可用性。
- [x] 复查 provider key 明文不返回、不写日志、不进 audit payload。
- [x] 复查新增 SQL 使用 Drizzle 或 D1 bind 参数。
- [x] 运行 `pnpm -F server test -- apiPermissions.test.ts`。

---

## 发现

### P0

无。

### P1

无。

### P2

#### Finding #1: 跨 provider group 成员缺少显式回归测试

- **位置**: `server/test/apiPermissions.test.ts`
- **现象**: 生产代码已经在创建和保存成员时校验 key 与 group provider 一致，但权限测试只覆盖了成功路径。
- **影响**: 后续重构 key group API 时可能误放开跨 provider 混用，导致调度能力、模型和 request format 不一致。
- **建议修复**: 增加跨 provider key 被拒绝的路由级回归测试。

---

## 修复

| Finding | 状态 | 备注                                                                  |
| ------- | ---- | --------------------------------------------------------------------- |
| #1      | ✅   | 新增跨 provider key group 成员拒绝测试，断言返回 `VALIDATION_ERROR`。 |

---

## 修复后验证

- [x] `pnpm -F server test -- apiPermissions.test.ts`

---

## 下一轮关注点

Round 5 聚焦 UX 与 a11y：密钥组排序是否有键盘/移动端兜底、表单 label 是否完整、窄屏布局是否可操作。

---

## 总结

本轮未发现生产代码中的权限或密钥泄露问题。补充了跨 provider group 成员的路由级安全回归测试，现有日志与 audit 只记录 key ID、hint 或数量，不记录明文 key。
