<!-- docs-architect-meta {"schema_version":1,"id":"EVID-REQ-2026-006","type":"evidence","title":"Verification for Align Micu supported image models","status":"completed","owners":[],"sources":["openspec/changes/archive/2026-10-27-REQ-2026-006-micu-model-catalog/**"],"update_when":["Acceptance evidence or unresolved findings change"],"relations":[{"type":"validates","target":"REQ-2026-006"}],"acceptance":[{"id":"AC-1","status":"passed","validates":["AC-1","BR-micu-release-002","SC-micu-release-002"],"methods":["command","inspection"],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-10-27-REQ-2026-006-micu-model-catalog/evidence/checks.txt","description":"Focused Micu routing, provider, task, and workspace tests passed"}],"reason":null,"authority":null}],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-10-27-REQ-2026-006-micu-model-catalog/evidence/checks.txt","description":"Focused Micu routing, provider, task, and workspace tests passed"}],"documentation_checks":[],"reviews":[{"charter":"integrated","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-10-27-REQ-2026-006-micu-model-catalog/evidence/checks.txt","description":"Integrated review of the four-model catalog, legacy aliases, gpt-image-2 size route, unchanged size tariff, and observed tests"}]}],"unresolved_findings":[],"verified_at":"2026-10-27T15:57:00+08:00","verified_against":"sha256:e376deefd309d7ed4334168f6edbd9daf7850deaa97cb125fa0799fcc82f4521@openspec/changes/archive/2026-10-27-REQ-2026-006-micu-model-catalog/evidence/revision.json","created_at":"2026-10-27T15:46:50+08:00","updated_at":"2026-10-27T15:56:13+08:00","completed_at":"2026-10-27T15:56:13+08:00"} -->

# EVID-REQ-2026-006: Verification for Align Micu supported image models

## Acceptance Evidence

AC-1 passed. The four current Micu models, legacy Flare/Sunburst aliases, `gpt-image-2` size routing, and the existing 1K/2K quota tiers are covered by the focused tests.

## Commands And Observations

- Captured results: [checks.txt](evidence/checks.txt)
- Implementation revision: [revision.json](evidence/revision.json)

## Review Summary

- Integrated review passed. No unresolved findings.
- Quota remains 1 unit below a 1600px edge and 2 units at or above it. Only `gpt-image-2` changes its upstream model at that edge.
- Production `Network connection lost` diagnosis is recorded outside this change and is not part of the implementation.

## Documentation Disposition

- Result: updated
- Current specs merged: `openspec/specs/micu-release/spec.md`
- Current system or product docs reviewed: `docs/API.md`, `docs/RELIABILITY.md`, `docs/USER_GUIDE.md`
- docs-architect checks, when integrated: not applicable (docs-architect not configured)

## Completion Record

- Verified revision: `sha256:e376deefd309d7ed4334168f6edbd9daf7850deaa97cb125fa0799fcc82f4521@openspec/changes/archive/2026-10-27-REQ-2026-006-micu-model-catalog/evidence/revision.json`
- Verification completed at: `2026-10-27T15:57:00+08:00`
- Close planning: passed
- Close result: completed
- Close completed at: `2026-10-27T15:56:13+08:00`
- Archive location: `openspec/changes/archive/2026-10-27-REQ-2026-006-micu-model-catalog`
- Post-close archive validation: passed
