<!-- docs-architect-meta {"schema_version":1,"id":"REQ-2026-002","type":"requirement","title":"Predictable navigation and responsive workflows","status":"done","owners":[],"origin":{"kind":"request","ref":"openspec/changes/archive/2026-09-06-REQ-2026-002-navigation-responsive-ux/request.md"},"approval":{"kind":"request-record","ref":"openspec/changes/archive/2026-09-06-REQ-2026-002-navigation-responsive-ux/request.md"},"sources":[],"update_when":["Scope, acceptance, risk, implementation, evidence, or documentation disposition changes"],"relations":[],"dependencies":[],"acceptance":[{"id":"AC-1","text":"List/detail and creation URLs support predictable back, forward, refresh and latest-request-wins behavior","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-09-06-REQ-2026-002-navigation-responsive-ux/evidence/checks.txt","description":"Observed command, browser, Linux CI and independent review results"}]},{"id":"AC-2","text":"Navigation, settings and management actions remain accessible on mobile and desktop","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-09-06-REQ-2026-002-navigation-responsive-ux/evidence/checks.txt","description":"Observed command, browser, Linux CI and independent review results"}]},{"id":"AC-3","text":"Core pages fit 3840x2160, 1920x1080, 1366x768 and mobile viewports without unreachable controls","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-09-06-REQ-2026-002-navigation-responsive-ux/evidence/checks.txt","description":"Observed command, browser, Linux CI and independent review results"}]},{"id":"AC-4","text":"CI validates develop/main with the pinned toolchain and gates production deployment after successful validation","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-09-06-REQ-2026-002-navigation-responsive-ux/evidence/checks.txt","description":"Observed command, browser, Linux CI and independent review results"}]}],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-09-06-REQ-2026-002-navigation-responsive-ux/evidence/checks.txt","description":"Observed command, browser, Linux CI and independent review results"}],"affected_code":[],"affected_docs":["docs/FRONTEND.md","docs/DEPLOYMENT.md","docs/USER_GUIDE.md"],"open_questions":[],"documentation_disposition":"updated","no_doc_change_scope":[],"no_doc_change_reason":null,"slug":"navigation-responsive-ux","complexity":"medium","risk":{"level":"medium","drivers":["ux-accessibility"]},"retention":"summary","domains":["frontend-navigation"],"spec_baselines":{"frontend-navigation":null},"ephemeral_artifacts":[],"created_at":"2026-09-06T03:10:52+08:00","updated_at":"2026-09-06T03:34:43+08:00","status_changed_at":"2026-09-06T03:34:43+08:00","completed_at":"2026-09-06T03:34:43+08:00","archived_at":"2026-09-06T03:34:43+08:00","status_history":[{"status":"accepted","at":"2026-09-06T03:10:52+08:00","reason":"Change created"},{"status":"done","at":"2026-09-06T03:34:43+08:00","reason":"Close completed"}],"verified_at":"2026-09-05T19:33:52Z","verified_against":"452debbdfa88211fae2686163cf153f1ad23b7f0"} -->

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

- [x] `AC-1` - List/detail and creation URLs support predictable back, forward, refresh and latest-request-wins behavior.
- [x] `AC-2` - Navigation, settings and management actions remain accessible on mobile and desktop.
- [x] `AC-3` - Core pages fit 3840x2160, 1920x1080, 1366x768 and mobile viewports without unreachable controls.
- [x] `AC-4` - CI validates develop/main with the pinned toolchain and gates production deployment after successful validation.

## Milestones

1. Correct navigation/state and settings with regression tests; commit/push develop.
2. Responsive shell and management surfaces with browser evidence; commit/push develop.
3. CI, aggregate verification, documentation closure; commit/push develop, then merge/push main and inspect deployment.

## Verification Approach

Existing and focused Vitest coverage, real browser at requested resolutions, local API smoke, typecheck/lint/build, workflow validation, and GitHub run inspection. Use local seeded accounts and existing data; real provider billing is outside UI verification.

## Documentation Disposition

- Result: updated
- Affected docs: `docs/FRONTEND.md`, `docs/DEPLOYMENT.md`, `docs/USER_GUIDE.md`

## History

- 2026-09-06T03:10:52+08:00 - User-authorized UX change created.
- 2026-09-06T03:33:52+08:00 - Implementation, independent review and local verification completed; milestones pushed to develop.

- 2026-09-06T03:34:43+08:00 - Close completed; requirement archived.
