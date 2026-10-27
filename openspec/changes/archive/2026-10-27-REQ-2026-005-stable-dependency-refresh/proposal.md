<!-- docs-architect-meta {"schema_version":1,"id":"REQ-2026-005","type":"requirement","title":"Refresh stable pinned dependencies","status":"done","owners":[],"origin":{"kind":"request","ref":"openspec/changes/archive/2026-10-27-REQ-2026-005-stable-dependency-refresh/request.md"},"approval":{"kind":"request-record","ref":"openspec/changes/archive/2026-10-27-REQ-2026-005-stable-dependency-refresh/request.md"},"sources":[],"update_when":["Scope, acceptance, risk, implementation, evidence, or documentation disposition changes"],"relations":[],"dependencies":[],"acceptance":[{"id":"AC-1","text":"Exact stable dependency pins install reproducibly and pass repository checks, with documented compatibility exceptions","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-10-27-REQ-2026-005-stable-dependency-refresh/evidence/checks.txt","description":"Observed lint, typecheck, tests, and dry-run build after the dependency refresh"}]}],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-10-27-REQ-2026-005-stable-dependency-refresh/evidence/checks.txt","description":"Observed lint, typecheck, tests, and dry-run build after the dependency refresh"}],"affected_code":[".nvmrc","package.json","pnpm-lock.yaml","pnpm-workspace.yaml","server/package.json","web/package.json","web/vite.config.ts"],"affected_docs":["docs/DEPLOYMENT.md"],"open_questions":[],"documentation_disposition":"updated","no_doc_change_scope":[],"no_doc_change_reason":null,"slug":"stable-dependency-refresh","complexity":"small","risk":{"level":"medium","drivers":["wide-blast-radius"]},"retention":"summary","domains":["tooling"],"spec_baselines":{"tooling":"d1be8ef7b792c8bd61ceb2e7fbba3c1e44c0095f9008c8081a1bbd65e8d9db3c"},"ephemeral_artifacts":[],"created_at":"2026-10-27T12:44:50+08:00","updated_at":"2026-10-27T12:53:08+08:00","status_changed_at":"2026-10-27T12:53:08+08:00","completed_at":"2026-10-27T12:53:08+08:00","archived_at":"2026-10-27T12:53:08+08:00","status_history":[{"status":"accepted","at":"2026-10-27T12:44:50+08:00","reason":"Change created"},{"status":"done","at":"2026-10-27T12:53:08+08:00","reason":"Close completed"}],"verified_at":"2026-10-27T12:53:30+08:00","verified_against":"sha256:76a2e0b1f8a097805ee3b96a1a17e2422af88c4c5ff6fa7ac183dffe016870eb@openspec/changes/archive/2026-10-27-REQ-2026-005-stable-dependency-refresh/evidence/revision.json"} -->

# REQ-2026-005: Refresh stable pinned dependencies

## Need

Workspace dependencies had fallen behind their current stable releases. Upgrade each direct dependency to the newest stable version that the existing toolchain and peer constraints accept.

## Scope

### In scope

Package manifests, lockfile, the pnpm pin, Node 24 alignment already present in `.nvmrc`, and the deployment note that records that Node version.

### Out of scope

Application behavior, Wrangler `compatibility_date`, and removing `@cloudflare/workers-types` in favor of generated runtime types.

## Acceptance Criteria

- [x] `AC-1` - Exact stable dependency pins install reproducibly and pass repository checks, with documented compatibility exceptions.

## Compatibility Decisions

- TypeScript stays at 6.0.3. TypeScript 7.0.2 is current, but typescript-eslint 8.72.1 accepts only `>=4.8.4 <6.1.0`, and 6.0.3 is the newest 6.x release.
- `@types/node` moves to 24.19.2, the newest Node 24 types. `@types/node` 26.6.5 describes Node 26, while `.nvmrc` and CI stay on Node 24.22.1.
- `@vueuse/core` stays at 14.4.0, the newest 14.x release. VueUse 15.0.0 is current, and reka-ui 2.11.0 still depends on `@vueuse/core` `^14.1.0`.
- Direct Miniflare stays at 4.20260730.0, the latest stable tag. Wrangler 4.153.0 bundles `miniflare@5.20261023.0-beta` itself.
- pnpm is pinned again at 12.15.0. The working tree had removed `packageManager`; CI's `pnpm/action-setup` requires that field, and 12.15.0 is the latest stable release.
- pnpm 12 keeps a one-day `minimumReleaseAge`. Packages published inside that window are listed in `minimumReleaseAgeExclude` so the resolved versions remain installable.

## Documentation Disposition

- Result: updated
- Affected docs: `docs/DEPLOYMENT.md`

## History

- 2026-10-27T12:44:50+08:00 - Change created.
- 2026-10-27T12:50:00+08:00 - Compatible stable pins selected and applied.

- 2026-10-27T12:53:08+08:00 - Close completed; requirement archived.
