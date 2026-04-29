# API Overview

All paths are under `/api`.

本地 Worker 启动后提供交互式 API Reference：`http://localhost:8787/api/docs`；机器可读 OpenAPI 3.1 JSON：`http://localhost:8787/api/openapi.json`。文档源维护在 [`server/src/docs/openapi.ts`](../server/src/docs/openapi.ts)，新增或调整路由时需要同步更新。

| Area             | Paths                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| System           | `GET /health`, `GET /config`, `GET /docs`, `GET /openapi.json`                                                        |
| Auth             | `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `POST /auth/password/change`                           |
| Current user     | `GET /me`, `PATCH /me`                                                                                                |
| Generate         | `POST /generate`, `GET /tasks/:id`, `POST /tasks/:id/retry`, `POST /tasks/:id/cancel`, `GET /ws/task/:id`             |
| Sessions         | `GET/POST /sessions`, `GET/PATCH/DELETE /sessions/:id`, `GET /sessions/:id/messages`, message delete, active task     |
| History          | `GET /history`, `GET /history/:id`                                                                                    |
| Images           | `GET /i/:imageId`, `POST /uploads`                                                                                    |
| Generation entry | `POST /generation/events`                                                                                             |
| Prompt assistant | `POST /prompt-assistant/turn`                                                                                         |
| Prompt cases     | `GET /prompt-cases`, `/sysadmin/prompt-cases*`                                                                        |
| Announcements    | `/announcements*`, `/sysadmin/announcements*`                                                                         |
| Admin            | `/admin/provider-keys`, `/admin/users`, quota, usage, and manual user password reset endpoints                        |
| Sysadmin         | `/sysadmin/providers`, `/sysadmin/provider-keys`, admins, dashboard, users, session inspection, preferences, settings |

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

## Related docs

- [SECURITY.md](./SECURITY.md) — auth cookies, CSRF, roles
- [EXPERIMENTS.md](./EXPERIMENTS.md) — generation A/B endpoints and semantics
- [DATABASE.md](./DATABASE.md) — persisted entities behind APIs
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — request flow
