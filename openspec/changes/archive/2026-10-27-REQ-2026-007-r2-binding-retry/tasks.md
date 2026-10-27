<!-- docs-architect-meta {"schema_version":1,"id":"PLAN-REQ-2026-007","type":"exec-plan","title":"Implement Retry transient R2 and D1 image persistence","status":"completed","owners":[],"sources":["openspec/changes/archive/2026-10-27-REQ-2026-007-r2-binding-retry/**"],"update_when":["Implementation progress, discoveries, recovery, or verification changes"],"relations":[{"type":"implements","target":"REQ-2026-007"}],"cancellations":[],"evidence":[],"affected_docs":["docs/RELIABILITY.md"],"verified_at":"2026-10-27T16:39:00+08:00","verified_against":"sha256:272c8eaffccad9c0120406e02f70fd1ebb5a81d3018b98a818b68fd845b64c78@openspec/changes/archive/2026-10-27-REQ-2026-007-r2-binding-retry/evidence/revision.json"} -->

# PLAN-REQ-2026-007: Implement Retry transient R2 and D1 image persistence

Resume an `in_progress` task first. Otherwise select the highest-priority task whose dependencies are completed.

| ID      | Priority | Status    | Depends on | Implements                 | Task                                                                  |
| ------- | -------: | --------- | ---------- | -------------------------- | --------------------------------------------------------------------- |
| `T-001` |        1 | completed | -          | AC-1, BR-image-persist-001 | Retry the same R2 key and D1 image row on documented transient errors |

## Evidence plan

| Acceptance | Methods            | Expected evidence                                   |
| ---------- | ------------------ | --------------------------------------------------- |
| AC-1       | automated, command | `server/test/r2PutRetry.test.ts` and its Vitest run |

## Progress

- 2026-10-27T16:32:21+08:00 - Plan created.
- 2026-10-27T16:36:00+08:00 - Retry implemented and focused tests passed.

## Recovery

- Safe resume: the implementation is in `server/src/lib/r2.ts` and `server/src/lib/bindingRetry.ts`.
