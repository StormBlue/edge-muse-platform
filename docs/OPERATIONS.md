# Operations

## Database Migration

```bash
pnpm -F server db:gen
pnpm -F server db:migrate:local
pnpm -F server db:migrate:remote
```

Review generated SQL before applying remote migrations.

## Secret Rotation

```bash
pnpm -F server wrangler secret put JWT_SECRET
pnpm -F server wrangler secret put KEY_ENCRYPTION_KEY
pnpm -F server wrangler secret put TURNSTILE_SECRET_KEY
pnpm -F server wrangler secret put RESEND_API_KEY
```

Provider keys are encrypted before entering D1. If `KEY_ENCRYPTION_KEY` changes, decrypt and re-encrypt provider keys before switching traffic.

## Rollback

- Worker code: redeploy the previous git tag.
- D1 data: use D1 Time Travel from Cloudflare dashboard for point-in-time recovery.
- R2 objects: images are immutable by key; deleted messages are soft-deleted first and cleaned after retention.

## Scheduled Jobs

- Daily cron runs deleted-image cleanup, failed-task digest, D1 table-size logging, and an operational D1 snapshot to R2.
- Snapshots are written to `backups/d1-operational-snapshot/YYYY-MM-DD.json`.
- Set `ALERT_EMAIL` and `RESEND_API_KEY` to receive failure digests.

## Time Travel Drill

1. Pick a timestamp within the D1 Time Travel retention window.
2. Export or restore the online database from Cloudflare dashboard.
3. Run the smoke test below against the restored database.
4. Record the timestamp, restore duration, and any manual fixups.

## Smoke Test

1. Login as sysadmin.
2. Create provider and provider key.
3. Create admin and assign key/quota.
4. Login as admin, create user with quota.
5. Login as user, generate image, open large viewer, verify history.
