<!-- docs-architect-meta {"schema_version":1,"id":"EVID-REQ-2026-005","type":"evidence","title":"Verification for Refresh stable pinned dependencies","status":"completed","owners":[],"sources":["openspec/changes/archive/2026-10-27-REQ-2026-005-stable-dependency-refresh/**"],"update_when":["Acceptance evidence or unresolved findings change"],"relations":[{"type":"validates","target":"REQ-2026-005"}],"acceptance":[{"id":"AC-1","status":"passed","validates":["AC-1","BR-tooling-001","SC-tooling-001"],"methods":["command","inspection"],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-10-27-REQ-2026-005-stable-dependency-refresh/evidence/checks.txt","description":"Observed lint, typecheck, tests, and dry-run build after the dependency refresh"}],"reason":null,"authority":null}],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-10-27-REQ-2026-005-stable-dependency-refresh/evidence/checks.txt","description":"Observed lint, typecheck, tests, and dry-run build after the dependency refresh"}],"documentation_checks":[],"reviews":[{"charter":"integrated","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-10-27-REQ-2026-005-stable-dependency-refresh/evidence/checks.txt","description":"Integrated review of compatible pins and observed checks"}]}],"unresolved_findings":[],"verified_at":"2026-10-27T12:53:30+08:00","verified_against":"sha256:76a2e0b1f8a097805ee3b96a1a17e2422af88c4c5ff6fa7ac183dffe016870eb@openspec/changes/archive/2026-10-27-REQ-2026-005-stable-dependency-refresh/evidence/revision.json","created_at":"2026-10-27T12:44:50+08:00","updated_at":"2026-10-27T12:53:08+08:00","completed_at":"2026-10-27T12:53:08+08:00"} -->

# EVID-REQ-2026-005: Verification for Refresh stable pinned dependencies

## Acceptance Evidence

AC-1 passed. Exact pins install, and lint, typecheck, existing tests, and the production dry-run build passed on Node 24.22.1.

## Commands And Observations

- Captured results: [checks.txt](evidence/checks.txt)
- Implementation revision: [revision.json](evidence/revision.json)

## Review Summary

- Integrated review passed. No unresolved findings.
- Compatibility exceptions: TypeScript 6.0.3, `@types/node` 24.19.2, `@vueuse/core` 14.4.0, direct Miniflare 4.20260730.0.

## Documentation Disposition

- Result: updated
- Current specs merged: `openspec/specs/tooling/spec.md`
- Current system or product docs reviewed: `docs/DEPLOYMENT.md`
- docs-architect checks, when integrated: not applicable (docs-architect not configured)

## Completion Record

- Verified revision: `sha256:76a2e0b1f8a097805ee3b96a1a17e2422af88c4c5ff6fa7ac183dffe016870eb@openspec/changes/archive/2026-10-27-REQ-2026-005-stable-dependency-refresh/evidence/revision.json`
- Verification completed at: `2026-10-27T12:53:30+08:00`
- Close planning: passed
- Close result: completed
- Close completed at: `2026-10-27T12:53:08+08:00`
- Archive location: `openspec/changes/archive/2026-10-27-REQ-2026-005-stable-dependency-refresh`
- Post-close archive validation: passed
