# Acceptance Checklist

Date: 2026-04-26

## Core Requirements

- ✅ Text-to-image task creation, async execution, R2 persistence, private image proxy, and history loading.
- ✅ Image-to-image references through authenticated upload, R2 storage, and provider request payloads.
- ✅ Chat mode context assembly with recent-message trimming and text/image response handling.
- ✅ Roles: sysadmin, admin, user; route guards and API role checks.
- ✅ Quota pre-consumption, refund on system-side failures, admin quota grants, and quota ledger.
- ✅ Provider abstraction with OpenAI-compatible implementation and robust response parsing.
- ✅ Admin user management, quota UI, usage charts, and manual password reset flow.
- ✅ Sysadmin provider/key/admin management, dashboard, user session audit, and preference selection.
- ✅ i18n base zh-CN/en-US, light/dark/system theme, responsive layout.
- ⏸ Online deployment, DNS cutover, and real Cloudflare resource smoke tests are blocked until account resource IDs and secrets are available.

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
