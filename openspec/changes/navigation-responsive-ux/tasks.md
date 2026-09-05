<!-- docs-architect-meta {"schema_version":1,"id":"PLAN-REQ-2026-002","type":"exec-plan","title":"Implement Predictable navigation and responsive workflows","status":"draft","owners":[],"sources":["openspec/changes/navigation-responsive-ux/**"],"update_when":["Implementation progress, discoveries, recovery, or verification changes"],"relations":[{"type":"implements","target":"REQ-2026-002"}],"cancellations":[],"evidence":[],"affected_docs":[],"verified_at":null,"verified_against":null} -->

# PLAN-REQ-2026-002: Implement Predictable navigation and responsive workflows

Resume an `in_progress` task first. Otherwise select the highest-priority task whose dependencies are completed.

| ID      | Priority | Status      | Depends on | Implements                             | Task                                                             |
| ------- | -------: | ----------- | ---------- | -------------------------------------- | ---------------------------------------------------------------- |
| `T-001` |        1 | completed   | -          | AC-1, BR-frontend-navigation-001       | Navigation, async state and settings fixes with regression tests |
| `T-002` |        2 | in_progress | T-001      | AC-2, AC-3, BR-frontend-navigation-002 | Responsive shell, management controls and browser verification   |
| `T-003` |        3 | pending     | T-002      | AC-4, BR-frontend-navigation-003       | CI validation, documentation, aggregate checks and release       |

## Evidence plan

| Acceptance | Methods                           | Expected evidence                                     |
| ---------- | --------------------------------- | ----------------------------------------------------- |
| AC-1       | existing-test, automated, runtime | Route and race regression tests; browser back/forward |
| AC-2       | automated, runtime                | Settings tests and mobile focus checks                |
| AC-3       | screenshot, inspection            | Requested viewport matrix                             |
| AC-4       | command, inspection               | Actionlint, local checks, GitHub run results          |

## Progress

- 2026-09-06T03:10:52+08:00 - Plan created.

## Recovery

- Safe resume: use the task selection rule above.
