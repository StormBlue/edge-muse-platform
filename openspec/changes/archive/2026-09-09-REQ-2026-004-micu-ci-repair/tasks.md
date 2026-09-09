<!-- docs-architect-meta {"schema_version":1,"id":"PLAN-REQ-2026-004","type":"exec-plan","title":"Implement 米醋模型回归与发布验证修正","status":"completed","owners":[],"sources":["openspec/changes/archive/2026-09-09-REQ-2026-004-micu-ci-repair/**"],"update_when":["Implementation progress, discoveries, recovery, or verification changes"],"relations":[{"type":"implements","target":"REQ-2026-004"}],"cancellations":[],"evidence":[{"ref":"openspec/changes/archive/2026-09-09-REQ-2026-004-micu-ci-repair/evidence/checks.txt","kind":"command","description":"Observed full test, typecheck, lint, build and billing/documentation review results"}],"affected_docs":[],"verified_at":"2026-09-09T06:40:34.126863+00:00","verified_against":"8376c1a9af4eb26a8e9f68b10b20a9f2763a073f"} -->

# 修正计划

| ID    | Priority | Status    | Depends on | Implements                | Task                                                     |
| ----- | -------: | --------- | ---------- | ------------------------- | -------------------------------------------------------- |
| T-001 |        1 | completed | -          | AC-1, BR-micu-release-001 | 修正模型测试、账本退款、测试发现与当前文档并完成全量验证 |

## Evidence plan

AC-1：全量 lint/typecheck/test/build、协议矩阵、D1 退款并发与回滚、文档链接检查与集成 diff 审查。
