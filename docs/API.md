# API Overview

All paths are under `/api`.

本地 Worker 启动后提供交互式 API Reference：`http://localhost:8787/api/docs`；机器可读 OpenAPI 3.1 JSON：`http://localhost:8787/api/openapi.json`。文档源维护在 [`server/src/docs/openapi.ts`](../server/src/docs/openapi.ts)，新增或调整路由时需要同步更新。

| Area             | Paths                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| System           | `GET /health`, `GET /config`, `GET /docs`, `GET /openapi.json`                                                                                      |
| Auth             | `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `POST /auth/password/change`                                                         |
| Current user     | `GET /me`, `PATCH /me`                                                                                                                              |
| Generate         | `POST /generate`, `GET /tasks/:id`, `POST /tasks/:id/retry`, `POST /tasks/:id/cancel`, `GET /ws/task/:id`                                           |
| Sessions         | `GET/POST /sessions`, `GET/PATCH/DELETE /sessions/:id`, `GET /sessions/:id/messages`, message delete, active task                                   |
| History          | `GET /history`, `GET /history/:id`                                                                                                                  |
| Images           | `GET /i/:imageId`, `POST /uploads`                                                                                                                  |
| Generation entry | `POST /generation/events`                                                                                                                           |
| Prompt assistant | `POST /prompt-assistant/turn`                                                                                                                       |
| Prompt cases     | `GET /prompt-cases`, `GET /prompt-cases/:id`, `/sysadmin/prompt-cases*`                                                                             |
| Announcements    | `/announcements*`, `/sysadmin/announcements*`                                                                                                       |
| Admin            | `/admin/provider-keys`, `/admin/users`, quota, usage, and manual user password reset endpoints                                                      |
| Sysadmin         | `/sysadmin/providers`, `/sysadmin/provider-keys`, `/sysadmin/generation-entry`, admins, dashboard, users, session inspection, preferences, settings |

Account provisioning is manual only: sysadmins create admins with passwords, and admins create users with passwords. There is no public signup, forgot-password, reset-token, or invite-email API.

Error format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {}
  }
}
```

Authentication notes:

- Most business endpoints require `em_access` Cookie or `Authorization: Bearer <access-token>`.
- All non-GET/HEAD/OPTIONS `/api/*` endpoints require `X-CSRF-Token` matching the `em_csrf` Cookie, except `POST /auth/login` and `POST /auth/refresh`.
- Admin endpoints require role `admin` or `sysadmin`; sysadmin endpoints require role `sysadmin`.
- `DELETE /sessions/:id` is a soft delete for generated sessions only: the session must have at least one task and every task must be terminal `succeeded` or `failed`. Regular history/session APIs hide soft-deleted sessions, while sysadmin session audit still returns them with `deletedAt`.
- `GET /sysadmin/users/:id/sessions` returns audit session cards data including owner summary, task count, success image count, soft-delete marker, and `coverImage` when a generated image is available.

Prompt cases:

- `GET /prompt-cases` returns a paged lightweight response: `{ items, pageInfo, facets }`. Query params: `locale` (default `zh-CN`), `limit` (default `60`, max `100`), `cursor`, `category`, `mode`, `size`, `featured`, and `search`.
- Public list items intentionally omit `promptTemplate`; use `GET /prompt-cases/:id?locale=...` to fetch the complete published case before applying a prompt or sending case context to the assistant.
- Public list sorting is stable: featured first, then `sortOrder`, `updatedAt desc`, and `id`. Cursor values are opaque and tied to the current filter set; changing filters restarts from the first page.
- `facets.categories`, `facets.sizes`, and `facets.modes` are computed server-side from published cases and should be used for the `/ai-image` filter UI instead of deriving global options from the current page only.

## Related docs

- [SECURITY.md](./SECURITY.md) — auth cookies, CSRF, roles
- [EXPERIMENTS.md](./EXPERIMENTS.md) — generation entry flags, funnel events (`/generation/events`), and sysadmin metrics
- [DATABASE.md](./DATABASE.md) — persisted entities behind APIs
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — request flow
