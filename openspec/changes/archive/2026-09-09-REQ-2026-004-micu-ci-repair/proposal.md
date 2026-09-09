<!-- docs-architect-meta {"schema_version":1,"id":"REQ-2026-004","type":"requirement","title":"米醋模型回归与发布验证修正","status":"done","owners":[],"origin":{"kind":"request","ref":"openspec/changes/archive/2026-09-09-REQ-2026-004-micu-ci-repair/request.md"},"approval":{"kind":"request-record","ref":"openspec/changes/archive/2026-09-09-REQ-2026-004-micu-ci-repair/request.md"},"sources":[],"update_when":["Scope, acceptance, risk, implementation, evidence, or documentation disposition changes"],"relations":[],"dependencies":[],"acceptance":[{"id":"AC-1","text":"米醋模型协议、配额回归与全量 CI 检查通过，测试自动发现且文档与当前功能一致。","status":"passed","evidence":[{"ref":"openspec/changes/archive/2026-09-09-REQ-2026-004-micu-ci-repair/evidence/checks.txt","kind":"command","description":"Observed full test, typecheck, lint, build and billing/documentation review results"}]}],"evidence":[{"ref":"openspec/changes/archive/2026-09-09-REQ-2026-004-micu-ci-repair/evidence/checks.txt","kind":"command","description":"Observed full test, typecheck, lint, build and billing/documentation review results"}],"affected_code":["server/test/","server/scripts/run-vitest-batches.mjs","server/src/lib/quota.ts","server/src/lib/tasks/failure.ts","server/src/providers/micuPolicy.ts"],"affected_docs":["docs/API.md","docs/TESTING.md","docs/DEPLOYMENT.md","docs/RELIABILITY.md","docs/ACCEPTANCE.md","docs/USER_GUIDE.md"],"open_questions":[],"documentation_disposition":"updated","no_doc_change_scope":[],"no_doc_change_reason":null,"slug":"micu-ci-repair","complexity":"medium","risk":{"level":"high","drivers":["billing"]},"retention":"summary","domains":["micu-release"],"spec_baselines":{"micu-release":null},"ephemeral_artifacts":[],"created_at":"2026-09-09T14:28:29+08:00","updated_at":"2026-09-09T14:41:31+08:00","status_changed_at":"2026-09-09T14:41:31+08:00","completed_at":"2026-09-09T14:41:31+08:00","archived_at":"2026-09-09T14:41:31+08:00","status_history":[{"status":"accepted","at":"2026-09-09T14:28:29+08:00","reason":"Change created"},{"status":"done","at":"2026-09-09T14:41:31+08:00","reason":"Close completed"}],"verified_at":"2026-09-09T06:40:34.126863+00:00","verified_against":"8376c1a9af4eb26a8e9f68b10b20a9f2763a073f"} -->

# REQ-2026-004: 米醋模型回归与发布验证修正

## Need

上次 8376c1a 修改路由却未同步测试，main/develop 在 pnpm test 失败。计费还存在 1K 后缀多扣、历史任务和其他渠道退款误判，需修正并验证。

## Scope

更新旧模型断言、补充矩阵与账本事务回归、自动发现服务端测试、修正当前 API/运维/用户文档。模型家族用户手选、语义自动路由、实际公告发布仍为原需求未完成项，本轮不声称已交付。

## Acceptance Criteria

- [x] `AC-1` - 米醋模型协议、配额回归与全量 CI 检查通过，测试自动发现且文档与当前功能一致。

## Documentation Disposition

- Result: updated
- Affected docs: `docs/API.md`, `docs/TESTING.md`, `docs/DEPLOYMENT.md`, `docs/RELIABILITY.md`, `docs/ACCEPTANCE.md`, `docs/USER_GUIDE.md`

## Delivery

验证后在 develop 提交并推送，等待 CI 后合并 main 并验证发布状态。

## History

- 2026-09-09：记录用户修正请求，完成本地验证。

- 2026-09-09T14:41:31+08:00 - Close completed; requirement archived.
