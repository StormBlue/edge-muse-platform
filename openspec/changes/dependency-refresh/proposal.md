<!-- docs-architect-meta {"schema_version":1,"id":"REQ-2026-001","type":"requirement","title":"Refresh stable pinned dependencies","status":"accepted","owners":[],"origin":{"kind":"request","ref":"openspec/changes/dependency-refresh/request.md"},"approval":{"kind":"request-record","ref":"openspec/changes/dependency-refresh/request.md"},"sources":[],"update_when":["Scope, acceptance, risk, implementation, evidence, or documentation disposition changes"],"relations":[],"dependencies":[],"acceptance":[{"id":"AC-1","text":"Exact stable dependency pins install reproducibly and pass repository checks, with documented compatibility exceptions","status":"pending","evidence":[]}],"evidence":[],"affected_code":["package.json","server/package.json","web/package.json","pnpm-lock.yaml","pnpm-workspace.yaml",".nvmrc"],"affected_docs":["docs/DEPLOYMENT.md"],"open_questions":[],"documentation_disposition":"updated","no_doc_change_scope":[],"no_doc_change_reason":null,"slug":"dependency-refresh","complexity":"small","risk":{"level":"medium","drivers":["wide-blast-radius"]},"retention":"summary","domains":["tooling"],"spec_baselines":{"tooling":null},"ephemeral_artifacts":[],"created_at":"2026-09-06T03:02:09+08:00","updated_at":"2026-09-06T03:02:09+08:00","status_changed_at":"2026-09-06T03:02:09+08:00","completed_at":null,"archived_at":null,"status_history":[{"status":"accepted","at":"2026-09-06T03:02:09+08:00","reason":"Change created"}],"verified_at":null,"verified_against":null} -->

# REQ-2026-001: Refresh stable pinned dependencies

## Need

Upgrade pnpm and workspace dependencies to current compatible stable exact versions.

## Scope

Package manifests, lockfile, Node alignment, exact-version defaults and deployment tooling documentation. Existing application behavior and deployment triggers remain the acceptance baseline.

## Acceptance Criteria

- [ ] `AC-1` - Exact stable dependency pins install reproducibly and pass repository checks, with documented compatibility exceptions.

## Compatibility Decisions

- TypeScript stays at 6.0.3 because typescript-eslint 8.69.0 requires TypeScript below 6.1.0.
- @types/node uses latest 24.x (24.13.3), matching Node 24 in CI and local development.
- Direct Miniflare uses latest stable 4.20260730.0. Its latest tag points to an alpha; stable Wrangler 4.129.0 bundles that alpha internally as published by Cloudflare.
- Upgrade indirect dependencies within their declared ranges to remove stale Vue renderer peers.

## Documentation Disposition

- Result: updated
- Affected docs: docs/DEPLOYMENT.md

## History

- 2026-09-06T03:02:09+08:00 - User-authorized change created.
