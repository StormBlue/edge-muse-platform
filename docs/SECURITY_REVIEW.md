# Security Review

Date: 2026-04-26

## Reviewed Controls

- Authentication uses httpOnly access/refresh cookies, CSRF token checks for non-GET requests, and JWT blacklist on logout.
- Login is Turnstile protected and rate limited; dev mode bypasses rate limits only for local smoke tests. Account creation and password resets are authenticated admin-only actions.
- Provider keys are AES-GCM encrypted before storage and never returned by API responses.
- Images are stored in private R2 and served through authenticated `/api/i/:imageId` with owner/sysadmin checks.
- Security headers include CSP, frame denial, content-type protection, referrer policy, and restricted permissions policy.
- User content is rendered as text, not `v-html`.
- Write operations emit audit log events for core auth, session, admin, sysadmin, and quota flows.

## Residual Risks

- Real Turnstile, DNS, and Cloudflare secrets must be configured for the online environment before public exposure. Resend is optional for operational alerts only.
- Online D1 Time Travel and backup restore drills require Cloudflare remote resources.
- E2E coverage should be expanded once stable Playwright browser tooling is available in CI.
