<!-- docs-architect-meta {"schema_version":1,"id":"EVID-REQ-2026-009","type":"evidence","title":"Verification for Fix responsive announcement dialog layout","status":"completed","owners":[],"sources":["openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/**"],"update_when":["Acceptance evidence or unresolved findings change"],"relations":[{"type":"validates","target":"REQ-2026-009"}],"acceptance":[{"id":"AC-1","status":"passed","validates":["AC-1","BR-announcements-001","SC-announcements-001"],"methods":["command","runtime","screenshot","inspection"],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/evidence/checks.txt","description":"Observed regression, typecheck, lint, build and integrated review"},{"kind":"log","ref":"openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/evidence/browser.txt","description":"Responsive light/dark browser rendering, keyboard scroll and close actions"}],"reason":null,"authority":null}],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/evidence/checks.txt","description":"Observed regression, typecheck, lint, build and integrated review"},{"kind":"log","ref":"openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/evidence/browser.txt","description":"Responsive light/dark browser rendering, keyboard scroll and close actions"}],"documentation_checks":[],"reviews":[{"charter":"integrated","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/evidence/checks.txt","description":"Observed regression, typecheck, lint, build and integrated review"}]}],"unresolved_findings":[],"verified_at":"2026-11-11T02:13:19.422658+00:00","verified_against":"sha256:ab5120152a7f3f5e5932795b6ba556f8b52c03aa4df68958cdd2fc86363f8462@openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/evidence/revision.json","created_at":"2026-11-11T10:01:55+08:00","updated_at":"2026-11-11T10:13:53+08:00","completed_at":"2026-11-11T10:13:53+08:00"} -->

# EVID-REQ-2026-009: Announcement dialog verification

## Acceptance Evidence

AC-1 passed. Desktop 1280x900, mobile 390x844 and narrow 320x568 layouts fit the viewport without body horizontal overflow. Long titles wrap; keyboard scrolling reaches the end while closing controls stay visible. Both footer close and Escape close the dialog. Light and dark screenshots retained in evidence.

## Commands And Observations

See [checks](evidence/checks.txt) and [browser observations](evidence/browser.txt). All focused regressions (3 tests), frontend typecheck, repository lint and production frontend build passed. Plaintext highlighting now handles unlabelled and unknown code fences without dropping the article.

## Review Summary

Independent integrated review passed. No unresolved findings. Shared dialog and scrollbar primitives remain unchanged; announcement Portal layout overrides are explicitly scoped by a dedicated class.

## Documentation Disposition

- Result: updated
- Current specs merged: `openspec/specs/announcements/spec.md`
- Current system or product docs reviewed: `docs/FRONTEND.md`
- docs-architect checks, when integrated: not applicable (docs-architect not configured)

## Completion Record

Verification completed against a captured working-tree revision. No commit, push or deployment performed.

- Verified revision: `sha256:ab5120152a7f3f5e5932795b6ba556f8b52c03aa4df68958cdd2fc86363f8462@openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/evidence/revision.json`
- Verification completed at: `2026-11-11T02:13:19.422658+00:00`
- Close planning: passed
- Close result: completed
- Close completed at: `2026-11-11T10:13:53+08:00`
- Archive location: `openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout`
- Post-close archive validation: passed
