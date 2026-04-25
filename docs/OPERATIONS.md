# Operations

## Database Migration

```bash
pnpm -F server db:gen
pnpm -F server db:migrate:local
pnpm -F server db:migrate:staging
pnpm -F server db:migrate:prod
```

Review generated SQL before applying remote migrations.

## Secret Rotation

```bash
pnpm -F server wrangler secret put JWT_SECRET --env staging
pnpm -F server wrangler secret put KEY_ENCRYPTION_KEY --env staging
pnpm -F server wrangler secret put TURNSTILE_SECRET_KEY --env staging
```

Provider keys are encrypted before entering D1. If `KEY_ENCRYPTION_KEY` changes, decrypt and re-encrypt provider keys before switching traffic.

## Rollback

- Worker code: redeploy the previous git tag.
- D1 data: use D1 Time Travel from Cloudflare dashboard for point-in-time recovery.
- R2 objects: images are immutable by key; deleted messages are soft-deleted first and cleaned after retention.

## Smoke Test

1. Login as sysadmin.
2. Create provider and provider key.
3. Create admin and assign key/quota.
4. Login as admin, create user with quota.
5. Login as user, generate image, open large viewer, verify history.
