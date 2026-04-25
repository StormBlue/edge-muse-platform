# API Overview

All paths are under `/api`.

| Area         | Paths                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| Auth         | `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, password reset/change                   |
| Current user | `GET /me`, `PATCH /me`                                                                                 |
| Sessions     | `GET/POST /sessions`, `GET/PATCH/DELETE /sessions/:id`, `GET /sessions/:id/messages`                   |
| Generate     | `POST /generate`, `GET /tasks/:id`, `POST /tasks/:id/retry`, `POST /tasks/:id/cancel`                  |
| Images       | `GET /i/:imageId`, `POST /uploads`                                                                     |
| Admin        | `/admin/users`, quota and usage endpoints                                                              |
| Sysadmin     | `/sysadmin/providers`, `/sysadmin/provider-keys`, `/sysadmin/admins`, dashboard and session inspection |

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
