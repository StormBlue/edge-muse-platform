# Edge Muse Platform Architecture

```mermaid
flowchart LR
  Browser["Vue 3 SPA"] --> Worker["Cloudflare Worker / Hono"]
  Worker --> D1["D1 / Drizzle"]
  Worker --> R2["Private R2 bucket"]
  Worker --> KV["KV: rate limit, JWT blacklist, cache"]
  Worker --> DO["Durable Object TaskRoom"]
  Worker --> WF["Workflow GenerateImage"]
  WF --> Provider["OpenAI-compatible image provider"]
  WF --> R2
  WF --> D1
  WF --> DO
```

## Runtime Shape

- One Worker serves API, WebSocket upgrade routes, and the built SPA through Workers Static Assets.
- D1 stores users, quotas, sessions, messages, tasks, provider config, image metadata, and audit logs.
- R2 is private. Images are only returned through `/api/i/:imageId` after cookie/JWT authorization.
- Durable Objects keep per-task websocket rooms and latest task state.
- Workflows run the long image generation path and persist results.

## Local Development

The default seed provider uses `base_url = "mock:"`; it returns deterministic SVG images so the platform can be tested without a paid image API key.
