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

## Provider Keys

The SPA no longer exposes a standalone provider management page. Sysadmins configure upstream access from **系统管理 → 密钥**:

1. Click **创建密钥**.
2. Select a supported provider.
   - 米醋API is inserted automatically as a built-in provider with `base_url = https://www.openclaudecode.cn` and the `openai_compatible` adapter.
   - Cubence is inserted automatically as a built-in provider with `base_url = https://api-dmit.cubence.com`, `request_format = openai_images`, and default model `gpt-image-2`.
3. Enter the provider API key and keep or override the default model.
4. Click the key row's test action to run the low-cost health check.
5. Assign the created key to admins or users through the existing user/admin management flows.

Only built-in supported providers can be selected when creating or rebinding keys. Legacy/custom provider rows and keys may still appear on existing key records for auditability, but they are not valid targets for new key assignment, admin/user binding, or sysadmin preference selection.

Generation users must have an explicit preferred key or `user_provider_keys` binding. The server intentionally does not fall back to the newest enabled global key, so adding a Cubence key cannot move unassigned users into Cubence traffic.

Cubence API keys must have the OpenAI share group set to `gpt-image-2` in the Cubence console. Built-in provider metadata is refreshed from the code catalog, so Cubence uses the current `api-dmit` base URL without keeping old-domain compatibility branches. If a Cubence key was created during earlier testing, delete it and create a new key before assigning traffic. A real text-to-image smoke test is required before production rollout and may consume Cubence balance.

## Rollback

- Worker code: redeploy the previous git tag.
- D1 data: use D1 Time Travel from Cloudflare dashboard for point-in-time recovery.
- R2 objects: images are immutable by key; deleted messages are soft-deleted first and cleaned after retention.
- Provider rollback: disable or unassign the Cubence provider key, then reassign affected users/admins to the previous 米醋 API key. Do not delete built-in provider rows during incident response; the API rejects built-in provider deletion and the catalog restores them for key-page consistency.

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
- For Cubence, `endpoint=images.generations` means text-to-image and `endpoint=images.edits` means multipart image-to-image. A `400` from Cubence often indicates an API key share-group or parameter issue.
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
2. Open key management and create a 米醋 API or Cubence provider key.
3. For Cubence, confirm the key has the `gpt-image-2` share group in the Cubence console.
4. Create admin and assign key/quota.
5. Login as admin, create user with quota.
6. Login as user, generate one text-to-image task, open large viewer, verify history.
7. For Cubence, generate one image-to-image task with a single reference image and confirm it uses `/v1/images/edits`.

## Related docs

- [RELIABILITY.md](./RELIABILITY.md) — cron, recovery, snapshots
- [DEPLOYMENT.md](./DEPLOYMENT.md) — CI/CD and Wrangler
- [SECURITY.md](./SECURITY.md) — secret rotation implications
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — logging and component map
