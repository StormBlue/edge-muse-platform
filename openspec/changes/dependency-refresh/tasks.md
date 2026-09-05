<!-- docs-architect-meta {"schema_version":1,"id":"PLAN-REQ-2026-001","type":"exec-plan","title":"Implement Refresh stable pinned dependencies","status":"draft","owners":[],"sources":["openspec/changes/dependency-refresh/**"],"update_when":["Implementation progress, discoveries, recovery, or verification changes"],"relations":[{"type":"implements","target":"REQ-2026-001"}],"cancellations":[],"evidence":[],"affected_docs":[],"verified_at":null,"verified_against":null} -->

# PLAN-REQ-2026-001: Implement Refresh stable pinned dependencies

Resume an `in_progress` task first. Otherwise select the highest-priority task whose dependencies are completed.

| ID | Priority | Status | Depends on | Implements | Task |
|---|---:|---|---|---|---|
| `T-001` | 1 | in_progress | - | AC-1, BR-tooling-001 | Upgrade exact stable dependencies and resolve compatibility constraints |
| `T-002` | 2 | pending | T-001 | AC-1, BR-tooling-001 | Run frozen install, lint, typecheck, tests, build and integrated review |

## Evidence plan

| Acceptance | Methods | Expected evidence |
|---|---|---|
| AC-1 | command, inspection | Registry metadata, frozen install and repository verification results |

## Progress

- 2026-09-06T03:02:09+08:00 - Plan created.

## Recovery

- Safe resume: use the task selection rule above.
