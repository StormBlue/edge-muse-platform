# Review Round 5 — UX 与 a11y

**日期**: 2026-05-13
**视角**: 配置 UI、拖拽排序、键盘兜底、移动端可操作性
**审核范围**: sysadmin key/group 页面、sysadmin admin 页面、admin user 页面
**关联需求**: [`requirements.md`](./requirements.md)
**关联任务**: [`tasks.md`](./tasks.md)

---

## 审核清单

- [x] 复查 key group 成员拖拽是否有上移/下移按钮兜底。
- [x] 复查图标按钮是否有可访问名称。
- [x] 复查表单字段是否有 label。
- [x] 复查窄屏下表格/弹窗是否使用滚动或紧凑布局。
- [x] 运行 `pnpm -F web test -- useSysadminKeysController.test.ts providerKeyQueueI18n.test.ts`。

---

## 发现

### P0

无。

### P1

无。

### P2

#### Finding #1: key group 图标按钮只有 title，缺少显式 aria-label

- **位置**: `web/src/views/sysadmin/Keys.vue`
- **现象**: 拖拽、上移、下移、删除成员使用图标按钮，已有 `title`，但没有显式 `aria-label`。
- **影响**: 部分辅助技术不一定把 tooltip title 当作稳定按钮名称。
- **建议修复**: 为图标按钮补 `aria-label`。

#### Finding #2: 成员添加 select 使用 inline TS cast handler

- **位置**: `web/src/views/sysadmin/Keys.vue`
- **现象**: 模板里直接写 `($event.target as HTMLSelectElement)` 并重置 value。
- **影响**: 功能可用，但模板可读性较差，后续维护和 a11y 调整不方便。
- **建议修复**: 抽成 `handleAddMember` 函数。

---

## 修复

| Finding | 状态 | 备注                                              |
| ------- | ---- | ------------------------------------------------- |
| #1      | ✅   | 为拖拽、上移、下移、删除图标按钮补 `aria-label`。 |
| #2      | ✅   | 抽出 `handleAddMember`，模板只绑定函数。          |

---

## 修复后验证

- [x] `pnpm -F web test -- useSysadminKeysController.test.ts providerKeyQueueI18n.test.ts`

---

## 下一轮关注点

Round 6-10 综合回归继续覆盖文档/OpenAPI、i18n、性能查询、迁移兼容和最终全量验证。

---

## 总结

本轮修复 2 个 P2 UI/a11y 问题。key group 排序仍同时支持拖拽和按钮操作，移动端可依赖按钮兜底完成排序。
