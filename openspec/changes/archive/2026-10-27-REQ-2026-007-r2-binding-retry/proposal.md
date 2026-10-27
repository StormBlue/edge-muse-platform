<!-- docs-architect-meta {"schema_version":1,"id":"REQ-2026-007","type":"requirement","title":"Retry transient R2 and D1 image persistence","status":"done","owners":[],"origin":{"kind":"request","ref":"openspec/changes/archive/2026-10-27-REQ-2026-007-r2-binding-retry/request.md"},"approval":{"kind":"request-record","ref":"openspec/changes/archive/2026-10-27-REQ-2026-007-r2-binding-retry/request.md"},"sources":[],"update_when":["Scope, acceptance, risk, implementation, evidence, or documentation disposition changes"],"relations":[],"dependencies":[],"acceptance":[{"id":"AC-1","text":"Image persistence retries the same new R2 key up to five times on Network connection lost, using If-None-Match: * and exponential backoff with jitter. A null conditional put still inserts the D1 row. The insert retries D1 transient errors and treats an existing unique row as success. Other errors fail immediately, and Micu is not called again.","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-10-27-REQ-2026-007-r2-binding-retry/evidence/checks.txt","description":"Focused R2 and D1 image persistence retry tests passed"}]}],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-10-27-REQ-2026-007-r2-binding-retry/evidence/checks.txt","description":"Focused R2 and D1 image persistence retry tests passed"}],"affected_code":["docs/RELIABILITY.md","server/src/lib/bindingRetry.ts","server/src/lib/r2.ts","server/src/lib/tasks/runGenerations.ts","server/test/r2PutRetry.test.ts"],"affected_docs":["docs/RELIABILITY.md"],"open_questions":[],"documentation_disposition":"updated","no_doc_change_scope":[],"no_doc_change_reason":null,"slug":"r2-binding-retry","complexity":"small","risk":{"level":"medium","drivers":["data-integrity"]},"retention":"summary","domains":["image-persist"],"spec_baselines":{"image-persist":null},"ephemeral_artifacts":[],"created_at":"2026-10-27T16:32:21+08:00","updated_at":"2026-10-27T16:39:00+08:00","status_changed_at":"2026-10-27T16:39:00+08:00","completed_at":"2026-10-27T16:39:00+08:00","archived_at":"2026-10-27T16:39:00+08:00","status_history":[{"status":"accepted","at":"2026-10-27T16:32:21+08:00","reason":"Change created"},{"status":"done","at":"2026-10-27T16:39:00+08:00","reason":"Close completed"}],"verified_at":"2026-10-27T16:39:00+08:00","verified_against":"sha256:272c8eaffccad9c0120406e02f70fd1ebb5a81d3018b98a818b68fd845b64c78@openspec/changes/archive/2026-10-27-REQ-2026-007-r2-binding-retry/evidence/revision.json"} -->

# REQ-2026-007: Retry transient R2 and D1 image persistence

## Need

Production image persistence reaches `R2.put` with a decoded PNG and then fails with `Network connection lost`. The Workers runtime classifies that exception as a retryable binding disconnect. The platform currently tries the put once, so the generated image is dropped after the provider has already billed it.

## Scope

### In scope

Retry the same new R2 object and the following `image_objects` insert when the documented transient errors occur. Keep the R2 key stable and use a create-once conditional write.

### Out of scope

Retrying the Micu request, changing Workflow step retries, deploying, or changing quota.

## Acceptance Criteria

- [x] `AC-1` - Image persistence retries the same new R2 key up to five times on Network connection lost, using If-None-Match: * and exponential backoff with jitter. A null conditional put still inserts the D1 row. The insert retries D1 transient errors and treats an existing unique row as success. Other errors fail immediately, and Micu is not called again.

## Documentation Disposition

- Result: updated
- Affected docs: `docs/RELIABILITY.md`

## History

- 2026-10-27T16:32:21+08:00 - Change created.
- 2026-10-27T16:36:00+08:00 - Binding retry implemented for R2 put and the D1 image row insert.

- 2026-10-27T16:39:00+08:00 - Close completed; requirement archived.
