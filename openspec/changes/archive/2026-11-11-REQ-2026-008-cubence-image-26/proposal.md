<!-- docs-architect-meta {"schema_version":1,"id":"REQ-2026-008","type":"requirement","title":"Keep only GPT Image 2.6 for Micu and Cubence","status":"done","owners":[],"origin":{"kind":"request","ref":"openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/request.md"},"approval":{"kind":"request-record","ref":"openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/request.md"},"sources":[],"update_when":["Scope, acceptance, risk, implementation, evidence, or documentation disposition changes"],"relations":[],"dependencies":[],"acceptance":[{"id":"AC-1","text":"Micu and Cubence expose only 2.6 Flare/Sunburst; old key defaults migrate, manual selection survives scheduling, automatic selection follows assigned key, quota stays unchanged, and historical replay remains usable.","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/evidence/checks.txt","description":"Observed focused regressions, typecheck, lint, build and integrated review"},{"kind":"log","ref":"openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/evidence/provider-support.txt","description":"Actual Micu listing and generation probes; official Cubence model catalog"}]}],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/evidence/checks.txt","description":"Observed focused regressions, typecheck, lint, build and integrated review"},{"kind":"log","ref":"openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/evidence/provider-support.txt","description":"Actual Micu listing and generation probes; official Cubence model catalog"}],"affected_code":["server/src/providers/cubencePolicy.ts","server/src/providers/micuPolicy.ts","server/src/providers/catalog.ts","server/src/lib/providerKeyGroups.ts","server/src/lib/tasks/create.ts","server/src/lib/tasks/runContext.ts","server/test/tasksCreate.test.ts","server/test/providerCapabilities.test.ts","server/test/micuPolicy.test.ts","server/test/provider.test.ts","server/test/queueScheduler.test.ts","web/src/components/chat/useChatInputController.ts","web/src/components/chat/ChatInput.test.ts","web/src/views/ai-image/useImageStudio.ts","web/src/views/ai-image/useImageStudio.test.ts"],"affected_docs":["docs/API.md","docs/USER_GUIDE.md","docs/RELIABILITY.md"],"open_questions":[],"documentation_disposition":"updated","no_doc_change_scope":[],"no_doc_change_reason":null,"slug":"cubence-image-26","complexity":"medium","risk":{"level":"medium","drivers":["external-contract"]},"retention":"summary","domains":["image-models","micu-release"],"spec_baselines":{"image-models":null,"micu-release":"e5d298443a9d038d36689bfed4016aecddf68303a5a78bbaa885b7553747cf25"},"ephemeral_artifacts":[],"created_at":"2026-11-11T09:42:55+08:00","updated_at":"2026-11-11T09:59:55+08:00","status_changed_at":"2026-11-11T09:59:55+08:00","completed_at":"2026-11-11T09:59:55+08:00","archived_at":"2026-11-11T09:59:55+08:00","status_history":[{"status":"accepted","at":"2026-11-11T09:42:55+08:00","reason":"Change created"},{"status":"verifying","at":"2026-11-11T01:59:01.498226+00:00","reason":"Implementation, provider probes and focused regression checks passed"},{"status":"done","at":"2026-11-11T09:59:55+08:00","reason":"Close completed"}],"verified_at":"2026-11-11T01:59:01.498226+00:00","verified_against":"sha256:a3475a774c8fa18c4343945b394b337a1f6e4e7dc00ba0ab698e589963db708d@openspec/changes/archive/2026-11-11-REQ-2026-008-cubence-image-26/evidence/revision.json"} -->

# REQ-2026-008: Keep only GPT Image 2.6 for Micu and Cubence

## Need

用户要求核实当前服务商对 GPT Image 2.6 的支持，并只保留该系列模型。随后明确要求使用提供的米醋测试 Key 实测。密钥只用于内存中的请求，不进入代码、日志或证据文件。

## Scope

- Micu: authenticated `/v1/models` confirms both 2.6 models; actual minimal generation probes are recorded in verification evidence.
- Cubence: public official catalog confirms both models; no account-specific Cubence generation claim.
- Only expose `gpt-image-2.6-flare` and `gpt-image-2.6-sunburst`, default Flare. Migrate old configured models safely at runtime; keep historical Micu family aliases readable.
- Preserve quota, provider keys/groups, Grok experiment, size restrictions and historical task records. No deployment or production database mutation.

## Acceptance Criteria

- [x] `AC-1` - Only 2.6 choices; automatic and manual routing, legacy replay and quota are verified.

## Documentation Disposition

- Result: updated
- Affected docs: `docs/API.md`, `docs/USER_GUIDE.md`, `docs/RELIABILITY.md`

## History

- 2026-11-11T01:59:01.498226+00:00 - Verified implementation and provider support; ready for close.

- 2026-11-11T09:59:55+08:00 - Close completed; requirement archived.
