<!-- docs-architect-meta {"schema_version":1,"id":"PLAN-REQ-2026-003","type":"exec-plan","title":"Implement AI 图像创作重构与任务再创作","status":"draft","owners":[],"sources":["openspec/changes/ai-image-studio/**"],"update_when":["Implementation progress, discoveries, recovery, or verification changes"],"relations":[{"type":"implements","target":"REQ-2026-003"}],"cancellations":[],"evidence":[],"affected_docs":[],"verified_at":null,"verified_against":null} -->

# PLAN-REQ-2026-003: Implement AI 图像创作重构与任务再创作

Resume an `in_progress` task first. Otherwise select the highest-priority task whose dependencies are completed.

| ID      | Priority | Status      | Depends on | Implements                                                                                                             | Task                                                       |
| ------- | -------: | ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `T-001` |        1 | completed   | -          | AC-4, AC-5, BR-ai-image-studio-004, BR-ai-image-studio-005                                                             | 调研与创作器交互设计，来源见 design.md                     |
| `T-002` |        1 | completed   | T-001      | AC-1, BR-ai-image-studio-001                                                                                           | 任务接口、取消退额原子性、来源权限与兼容契约；M1 提交      |
| `T-003` |        2 | in_progress | T-002      | AC-2, AC-3, AC-4, AC-5, BR-ai-image-studio-002, BR-ai-image-studio-003, BR-ai-image-studio-004, BR-ai-image-studio-005 | 任务中心、创作器、工作台再创作、助手与对比；M2 提交        |
| `T-004` |        3 | pending     | T-003      | AC-6, BR-ai-image-studio-006                                                                                           | 浏览器边界验证、独立评审、文档同步归档；M3 提交，合并 main |

## Evidence plan

| Acceptance | Methods                        | Expected evidence                                                 |
| ---------- | ------------------------------ | ----------------------------------------------------------------- |
| AC-1       | automated, inspection          | API 权限、账本退额、竞态和来源引用测试；security/privacy 独立审查 |
| AC-2       | automated, runtime             | 跨账号/过期请求、快速终态通知、取消和列表删除刷新                 |
| AC-3       | automated, runtime, screenshot | 来源回填、能力回退、显式生成、并排对比                            |
| AC-4       | automated, runtime, screenshot | 默认编辑器、案例选择、路由旧请求隔离                              |
| AC-5       | automated, runtime             | 助手不自动回填，审阅、选择追加、用户编辑冲突处理                  |
| AC-6       | command, screenshot            | lint/typecheck/test/build 与桌面/手机实机浏览器                   |

## Progress

- 2026-09-06T04:01:41+08:00 - Plan created.

## Recovery

- Safe resume: use the task selection rule above.
