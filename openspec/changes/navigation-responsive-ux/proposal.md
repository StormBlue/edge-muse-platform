<!-- docs-architect-meta {"schema_version":1,"id":"REQ-2026-002","type":"requirement","title":"Predictable navigation and responsive workflows","status":"accepted","owners":[],"origin":{"kind":"request","ref":"openspec/changes/navigation-responsive-ux/request.md"},"approval":{"kind":"request-record","ref":"openspec/changes/navigation-responsive-ux/request.md"},"sources":[],"update_when":["Scope, acceptance, risk, implementation, evidence, or documentation disposition changes"],"relations":[],"dependencies":[],"acceptance":[{"id":"AC-1","text":"List/detail and creation URLs support predictable back, forward, refresh and latest-request-wins behavior","status":"pending","evidence":[]},{"id":"AC-2","text":"Navigation, settings and management actions remain accessible on mobile and desktop","status":"pending","evidence":[]},{"id":"AC-3","text":"Core pages fit 3840x2160, 1920x1080, 1366x768 and mobile viewports without unreachable controls","status":"pending","evidence":[]},{"id":"AC-4","text":"CI validates develop/main with the pinned toolchain and gates production deployment after successful validation","status":"pending","evidence":[]}],"evidence":[],"affected_code":[],"affected_docs":["docs/FRONTEND.md","docs/DEPLOYMENT.md","docs/USER_GUIDE.md"],"open_questions":[],"documentation_disposition":"pending","no_doc_change_scope":[],"no_doc_change_reason":null,"slug":"navigation-responsive-ux","complexity":"medium","risk":{"level":"medium","drivers":["ux-accessibility"]},"retention":"summary","domains":["frontend-navigation"],"spec_baselines":{"frontend-navigation":null},"ephemeral_artifacts":[],"created_at":"2026-09-06T03:10:52+08:00","updated_at":"2026-09-06T03:10:52+08:00","status_changed_at":"2026-09-06T03:10:52+08:00","completed_at":null,"archived_at":null,"status_history":[{"status":"accepted","at":"2026-09-06T03:10:52+08:00","reason":"Change created"}],"verified_at":null,"verified_against":null} -->

# REQ-2026-002: Predictable navigation and responsive workflows

## Need

Users lose context in page transitions and browser back/forward; mobile and narrower desktop layouts expose hidden controls and clipped work areas.

## Scope

- History and audit list/detail navigation and async responses.
- Creation case/blank URLs, explicit workspace session navigation and stale-message isolation.
- Mobile navigation accessibility, scroll restoration, responsive work areas and management actions.
- Discoverable settings with submission feedback.
- Verify/update GitHub Actions for the new toolchain and deploy only tested main commits.

## Acceptance Criteria

- [ ] `AC-1` - List/detail and creation URLs support predictable back, forward, refresh and latest-request-wins behavior.
- [ ] `AC-2` - Navigation, settings and management actions remain accessible on mobile and desktop.
- [ ] `AC-3` - Core pages fit 3840x2160, 1920x1080, 1366x768 and mobile viewports without unreachable controls.
- [ ] `AC-4` - CI validates develop/main with the pinned toolchain and gates production deployment after successful validation.

## Milestones

1. Correct navigation/state and settings with regression tests; commit/push develop.
2. Responsive shell and management surfaces with browser evidence; commit/push develop.
3. CI, aggregate verification, documentation closure; commit/push develop, then merge/push main and inspect deployment.

## Verification Approach

Existing and focused Vitest coverage, real browser at requested resolutions, local API smoke, typecheck/lint/build, workflow validation, and GitHub run inspection. Use local seeded accounts and existing data; real provider billing is outside UI verification.

## Documentation Disposition

- Result: pending
- Affected docs: docs/FRONTEND.md, docs/USER_GUIDE.md, docs/DEPLOYMENT.md
