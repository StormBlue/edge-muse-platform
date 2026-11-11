<!-- docs-architect-meta {"schema_version":1,"id":"EVID-REQ-2026-008","type":"evidence","title":"Verification for GPT Image 2.6 catalogs","status":"completed","owners":[],"sources":["openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/**"],"update_when":["Acceptance evidence or unresolved findings change"],"relations":[{"type":"validates","target":"REQ-2026-008"}],"acceptance":[{"id":"AC-1","status":"passed","validates":["AC-1","BR-image-models-001","SC-image-models-001","BR-micu-release-002","SC-micu-release-002"],"methods":["command","runtime","inspection"],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/evidence/checks.txt","description":"Observed focused regressions, typecheck, lint, build and integrated review"},{"kind":"log","ref":"openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/evidence/provider-support.txt","description":"Actual Micu listing and generation probes; official Cubence model catalog"}],"reason":null,"authority":null}],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/evidence/checks.txt","description":"Observed focused regressions, typecheck, lint, build and integrated review"},{"kind":"log","ref":"openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/evidence/provider-support.txt","description":"Actual Micu listing and generation probes; official Cubence model catalog"}],"documentation_checks":[],"reviews":[{"charter":"integrated","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/evidence/checks.txt","description":"Observed focused regressions, typecheck, lint, build and integrated review"}]}],"unresolved_findings":[],"verified_at":"2026-11-11T01:59:01.498226+00:00","verified_against":"sha256:a3475a774c8fa18c4343945b394b337a1f6e4e7dc00ba0ab698e589963db708d@openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/evidence/revision.json","created_at":"2026-11-11T09:42:55+08:00","updated_at":"2026-11-11T09:59:55+08:00","completed_at":"2026-11-11T09:59:55+08:00"} -->

# EVID-REQ-2026-008: GPT Image 2.6 provider catalogs

## Acceptance Evidence

AC-1 passed. See [provider observations](evidence/provider-support.txt) and [checks](evidence/checks.txt). Micu returned images for both models; Cubence is confirmed by its public catalog only. Initial Micu connection interruptions were recovered on retry.

## Review Summary

Independent integrated review passed after fixing automatic model precedence, legacy retry and replay, studio model reset and stale documentation. No unresolved findings.

## Documentation Disposition

- Result: updated
- Current system or product docs reviewed: `docs/API.md`, `docs/USER_GUIDE.md`, `docs/RELIABILITY.md`
- docs-architect integration: not configured; no repository-wide reinitialization.
- Current specs merged: `openspec/specs/image-models/spec.md`, `openspec/specs/micu-release/spec.md`
- docs-architect checks, when integrated: not applicable (docs-architect not configured)

## Completion Record

Close pending readiness verification. Worktree only; no commit, push or deployment authorized.

- Verified revision: `sha256:a3475a774c8fa18c4343945b394b337a1f6e4e7dc00ba0ab698e589963db708d@openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/evidence/revision.json`
- Verification completed at: `2026-11-11T01:59:01.498226+00:00`
- Close planning: passed
- Close result: completed
- Close completed at: `2026-11-11T09:59:55+08:00`
- Archive location: `openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26`
- Post-close archive validation: passed
