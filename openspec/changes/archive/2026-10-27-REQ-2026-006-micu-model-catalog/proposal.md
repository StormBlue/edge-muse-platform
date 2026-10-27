<!-- docs-architect-meta {"schema_version":1,"id":"REQ-2026-006","type":"requirement","title":"Align Micu supported image models","status":"done","owners":[],"origin":{"kind":"request","ref":"openspec/changes/archive/2026-10-27-REQ-2026-006-micu-model-catalog/request.md"},"approval":{"kind":"request-record","ref":"openspec/changes/archive/2026-10-27-REQ-2026-006-micu-model-catalog/request.md"},"sources":[],"update_when":["Scope, acceptance, risk, implementation, evidence, or documentation disposition changes"],"relations":[],"dependencies":[],"acceptance":[{"id":"AC-1","text":"Selectable Micu models are the four current IDs; legacy Flare and Sunburst openai aliases are rewritten, only gpt-image-2 changes model at 2K/4K, and the size-based quota stays unchanged","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-10-27-REQ-2026-006-micu-model-catalog/evidence/checks.txt","description":"Focused Micu routing, provider, task, and workspace tests passed"}]}],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-10-27-REQ-2026-006-micu-model-catalog/evidence/checks.txt","description":"Focused Micu routing, provider, task, and workspace tests passed"}],"affected_code":["docs/API.md","docs/RELIABILITY.md","docs/USER_GUIDE.md","server/src/lib/providerKeyGroups.ts","server/src/lib/tasks/create.ts","server/src/providers/micuPolicy.ts","server/test/micuPolicy.test.ts","server/test/provider.test.ts","server/test/tasksCreate.test.ts","web/src/components/chat/ChatInput.vue","web/src/views/ai-image/StudioEditor.vue","web/src/views/workspace/workspaceOptions.test.ts","web/src/views/workspace/workspaceOptions.ts"],"affected_docs":["docs/API.md","docs/RELIABILITY.md","docs/USER_GUIDE.md"],"open_questions":[],"documentation_disposition":"updated","no_doc_change_scope":[],"no_doc_change_reason":null,"slug":"micu-model-catalog","complexity":"medium","risk":{"level":"medium","drivers":["external-contract","billing"]},"retention":"summary","domains":["micu-release"],"spec_baselines":{"micu-release":"6229a50462339bc4a4cee1eaeb144604445a070bb72e48c533e7a818700ecd3b"},"ephemeral_artifacts":[],"created_at":"2026-10-27T15:46:50+08:00","updated_at":"2026-10-27T15:56:13+08:00","status_changed_at":"2026-10-27T15:56:13+08:00","completed_at":"2026-10-27T15:56:13+08:00","archived_at":"2026-10-27T15:56:13+08:00","status_history":[{"status":"accepted","at":"2026-10-27T15:46:50+08:00","reason":"Change created"},{"status":"done","at":"2026-10-27T15:56:13+08:00","reason":"Close completed"}],"verified_at":"2026-10-27T15:57:00+08:00","verified_against":"sha256:e376deefd309d7ed4334168f6edbd9daf7850deaa97cb125fa0799fcc82f4521@openspec/changes/archive/2026-10-27-REQ-2026-006-micu-model-catalog/evidence/revision.json"} -->

# REQ-2026-006: Align Micu supported image models

## Need

Micu's current image catalog no longer treats the Flare and Sunburst `-openai` IDs as selectable models. The platform still offered those IDs and routed every 2K/4K request onto an `-openai` model, which the upstream account rejected.

## Scope

### In scope

The selectable Micu model list, legacy Flare/Sunburst alias handling, size routing for `gpt-image-2`, the workspace size filter, and the user-facing model wording.

### Out of scope

Changing the 1-unit/2-unit size tariff, retrying `Network connection lost`, and deploying this change.

## Acceptance Criteria

- [x] `AC-1` - Selectable Micu models are the four current IDs; legacy Flare and Sunburst openai aliases are rewritten, only gpt-image-2 changes model at 2K/4K, and the size-based quota stays unchanged.

## Documentation Disposition

- Result: updated
- Affected docs: `docs/API.md`, `docs/RELIABILITY.md`, `docs/USER_GUIDE.md`

## History

- 2026-10-27T15:46:50+08:00 - Change created.
- 2026-10-27T15:56:00+08:00 - Model catalog and routing implemented.

- 2026-10-27T15:56:13+08:00 - Close completed; requirement archived.
