# Edge Muse User Guide

## Workspace

1. Open **工作台**.
2. Choose an available mode. The visible modes and sizes follow the provider key assigned to your account.
3. Enter a prompt, choose size and image count, then click **生成**.
4. For 图生图, drag, paste, or select reference images. Large images are compressed before upload. Some providers have stricter limits; Cubence currently accepts one reference image for image-to-image.
5. Click a generated image to open the viewer. The viewer supports zoom, previous/next image, download, prompt copy, and message deletion.

## History

- Open **历史** to search prior sessions by title or prompt.
- Sort by 最近, 最早, or 任务最多.
- Select any session to resume the conversation.

## Accounts

- Accounts are created manually. Sysadmins create admins and assign an initial password; admins create normal users and assign an initial password.
- Password recovery is handled by admins manually. There is no public forgot-password or invite-email flow.

## Admin

- Admins can create users, set or reset user passwords, grant quota within their own remaining quota, inspect usage, and enable/disable users.

## Sysadmin

- Sysadmins manage provider keys, admins, admin passwords, global dashboard metrics, user session audits, and their own default provider key preference. Provider types are selected directly while creating a key; there is no separate provider management page.
- Cubence keys support 文生图 and 图生图. 对话 mode is hidden for Cubence until its image chat endpoint is confirmed.

## Related docs

- [PRODUCT_SENSE.md](./PRODUCT_SENSE.md) — roles and journeys
- [OPERATIONS.md](./OPERATIONS.md) — sysadmin configuration (operators)
