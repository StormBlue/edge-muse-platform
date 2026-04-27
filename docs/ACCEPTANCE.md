# Acceptance Checklist

Date: 2026-04-27

## Core Requirements

- ✅ Text-to-image task creation, async execution, R2 persistence, private image proxy, and history loading.
- ✅ Image-to-image references through authenticated upload, R2 storage, and provider request payloads.
- ✅ Chat mode context assembly with recent-message trimming and text/image response handling.
- ✅ Roles: sysadmin, admin, user; route guards and API role checks.
- ✅ Quota pre-consumption, refund on system-side failures, admin quota grants, and quota ledger.
- ✅ Provider abstraction with OpenAI-compatible implementation and robust response parsing.
- ✅ Cubence/OpenAI Images provider implementation for `/v1/images/generations` and multipart `/v1/images/edits`.
- ✅ Workspace mode, size, and reference-image controls follow the current provider key capabilities; Cubence chat is hidden and blocked server-side.
- ✅ Sysadmin key page can create 米醋API or Cubence keys and run the provider health check without restoring the old provider management page.
- ✅ Sysadmin key creation/rebinding and provider-key assignment are limited to built-in supported providers; legacy provider rows and keys remain display-only for existing records.
- ✅ Key resolution is explicit; unbound users do not fall back to the newest global key, generation session reuse checks ownership, and blank `sessionId` is normalized before task creation.
- ✅ Admin user management, quota UI, usage charts, and manual password reset flow.
- ✅ Sysadmin key/admin management, dashboard, user session audit, and preference selection. Provider selection now happens from key creation.
- ✅ i18n base zh-CN/en-US, light/dark/system theme, responsive layout.
- ⏸ Online deployment, DNS cutover, and real Cloudflare resource smoke tests are blocked until account resource IDs and secrets are available.

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

Latest Cubence integration verification on 2026-04-27:

- `pnpm -F server typecheck`
- `pnpm -F web typecheck`
- `pnpm -F server test`
- `pnpm lint`
- `pnpm -F web build`
- `pnpm -F server build`

Latest Cubence audit-fix verification on 2026-04-27:

- `pnpm -F server typecheck`
- `pnpm -F server test` (9 files, 38 tests)
- `pnpm lint`
- `pnpm -F web typecheck`
- `pnpm -F web build`
- `pnpm -F server build`

Real Cubence text-to-image and image-to-image smoke tests still require a live Cubence key with `gpt-image-2` share group and balance.

## Related docs

- [TESTING.md](./TESTING.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [archive/CUBENCE_INTEGRATION_TASKS.md](./archive/CUBENCE_INTEGRATION_TASKS.md) — historical integration checklist
