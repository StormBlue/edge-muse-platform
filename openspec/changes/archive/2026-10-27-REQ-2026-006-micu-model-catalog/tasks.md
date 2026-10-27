<!-- docs-architect-meta {"schema_version":1,"id":"PLAN-REQ-2026-006","type":"exec-plan","title":"Implement Align Micu supported image models","status":"completed","owners":[],"sources":["openspec/changes/archive/2026-10-27-REQ-2026-006-micu-model-catalog/**"],"update_when":["Implementation progress, discoveries, recovery, or verification changes"],"relations":[{"type":"implements","target":"REQ-2026-006"}],"cancellations":[],"evidence":[],"affected_docs":["docs/API.md","docs/RELIABILITY.md","docs/USER_GUIDE.md"],"verified_at":"2026-10-27T15:57:00+08:00","verified_against":"sha256:e376deefd309d7ed4334168f6edbd9daf7850deaa97cb125fa0799fcc82f4521@openspec/changes/archive/2026-10-27-REQ-2026-006-micu-model-catalog/evidence/revision.json"} -->

# PLAN-REQ-2026-006: Implement Align Micu supported image models

Resume an `in_progress` task first. Otherwise select the highest-priority task whose dependencies are completed.

| ID      | Priority | Status    | Depends on | Implements                | Task                                                                            |
| ------- | -------: | --------- | ---------- | ------------------------- | ------------------------------------------------------------------------------- |
| `T-001` |        1 | completed | -          | AC-1, BR-micu-release-002 | Align the Micu catalog, legacy aliases, gpt-image-2 size route, and size tariff |

## Evidence plan

| Acceptance | Methods | Expected evidence                                         |
| ---------- | ------- | --------------------------------------------------------- |
| AC-1       | command | `openspec/changes/micu-model-catalog/evidence/checks.txt` |

## Progress

- 2026-10-27T15:46:50+08:00 - Plan created.
- 2026-10-27T15:56:00+08:00 - Routing, whitelist, workspace sizes, and docs updated. Focused tests passed.

## Recovery

- Safe resume: rerun the Micu policy, provider, task creation, and workspace option tests.
