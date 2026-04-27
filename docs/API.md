# API Overview

All paths are under `/api`.

| Area         | Paths                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| Auth         | `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `POST /auth/password/change`            |
| Current user | `GET /me`, `PATCH /me`                                                                                 |
| Sessions     | `GET/POST /sessions`, `GET/PATCH/DELETE /sessions/:id`, `GET /sessions/:id/messages`                   |
| Generate     | `POST /generate`, `GET /tasks/:id`, `POST /tasks/:id/retry`, `POST /tasks/:id/cancel`                  |
| Images       | `GET /i/:imageId`, `POST /uploads`                                                                     |
| Admin        | `/admin/users`, quota, usage, and manual user password reset endpoints                                 |
| Sysadmin     | `/sysadmin/providers`, `/sysadmin/provider-keys`, `/sysadmin/admins`, dashboard and session inspection |

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

## Related docs

- [SECURITY.md](./SECURITY.md) — auth cookies, CSRF, roles
- [DATABASE.md](./DATABASE.md) — persisted entities behind APIs
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — request flow
