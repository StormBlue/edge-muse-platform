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
```

Provider keys are encrypted before entering D1. If `KEY_ENCRYPTION_KEY` changes, decrypt and re-encrypt provider keys before switching traffic.

## Rollback

- Worker code: redeploy the previous git tag.
- D1 data: use D1 Time Travel from Cloudflare dashboard for point-in-time recovery.
- R2 objects: images are immutable by key; deleted messages are soft-deleted first and cleaned after retention.

## Scheduled Jobs

- Daily cron runs deleted-image cleanup, failed-task digest, D1 table-size logging, and an operational D1 snapshot to R2.
- Snapshots are written to `backups/d1-operational-snapshot/YYYY-MM-DD.json`.
- To receive failure digests by email, set `ALERT_EMAIL` and optional `RESEND_API_KEY`. User account creation and password resets do not require email.

## Runtime Logs

Cloudflare Workers logs are structured JSON. For live debugging:

```bash
pnpm -F server wrangler tail --format pretty
```

Useful filters:

- `event=generate.request.received` confirms the platform accepted a generation request.
- `event=provider.fetch.started` and `event=provider.fetch.succeeded` show outbound provider calls without API keys or full request bodies.
- `event=provider.response.parsed` shows provider request id, parsed image count, response shape, and text length.
- `event=image.r2.put_succeeded` and `event=image.db.inserted` confirm R2 and D1 persistence.
- `event=task.finish.task_updated` and `event=task.finish.message_updated` confirm final task/message state.

Trace by `taskId` first. For the initial HTTP request, use `traceId`; after async workflow dispatch, `taskId` is the stable correlation id.

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
