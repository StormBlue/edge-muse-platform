<!-- docs-architect-meta {"schema_version":1,"id":"PLAN-REQ-2026-002","type":"exec-plan","title":"Implement Predictable navigation and responsive workflows","status":"completed","owners":[],"sources":["openspec/changes/archive/2026-09-06-REQ-2026-002-navigation-responsive-ux/**"],"update_when":["Implementation progress, discoveries, recovery, or verification changes"],"relations":[{"type":"implements","target":"REQ-2026-002"}],"cancellations":[],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-09-06-REQ-2026-002-navigation-responsive-ux/evidence/checks.txt","description":"Observed command, browser, Linux CI and independent review results"}],"affected_docs":[],"verified_at":"2026-09-05T19:33:52Z","verified_against":"452debbdfa88211fae2686163cf153f1ad23b7f0"} -->

# PLAN-REQ-2026-002: Implement Predictable navigation and responsive workflows

Resume an `in_progress` task first. Otherwise select the highest-priority task whose dependencies are completed.

| ID      | Priority | Status    | Depends on | Implements                             | Task                                                                              |
| ------- | -------: | --------- | ---------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| `T-001` |        1 | completed | -          | AC-1, BR-frontend-navigation-001       | Navigation, async state and settings fixes with regression tests                  |
| `T-002` |        2 | completed | T-001      | AC-2, AC-3, BR-frontend-navigation-002 | Responsive shell, management controls and browser verification                    |
| `T-003` |        3 | completed | T-002      | AC-4, BR-frontend-navigation-003       | CI validation, documentation and aggregate checks; release follows archive commit |

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
