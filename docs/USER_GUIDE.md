# Edge Muse User Guide

## Workspace and AI image

1. Depending on **Generation entry** settings, you may see **工作台** (`/workspace`), **AI 图像生成** (`/ai-image`), or both. Sysadmins always see both; normal users follow [`EXPERIMENTS.md`](./EXPERIMENTS.md).
2. Open **工作台** or **AI 图像生成** from the sidebar.
3. Choose an available mode. The visible modes and sizes follow the provider key assigned to your account.
4. Enter a prompt, choose size and image count, then click **生成**.
5. For 图生图, drag, paste, or select reference images. Large images are compressed before upload. The visible upload limit follows the provider key assigned to your account.
6. Click a generated image to open the viewer. The viewer supports zoom, previous/next image, download, prompt copy, and message deletion.

- In AI image generation, choose blank creation to start without a case. Back returns to the case library; browser Back and Forward follow the selected page mode. Refreshing blank mode keeps that mode, but does not guarantee recovery of an unsent prompt.
- Opening a specific workspace session keeps that session selected, even when another task is running. Opening the workspace without a session can resume the active task for a normal user. Existing limits on starting another task still apply.

## Navigation on desktop and mobile

- On desktop, collapse the sidebar to give images and forms more room. Narrow windows stack content vertically; wider screens show more history and audit items per row.
- On a phone, use the bottom navigation for primary pages and **更多** for the full menu available to your account. Close the menu using its close button, the backdrop, or Escape when using a keyboard.
- Returning to a previously visited page restores its content scroll position while the app remains open. Pages with different filters or page numbers keep separate positions.

## History

- Open **历史** to search prior sessions by title or prompt.
- Sort by 最近, 最早, or 任务最多.
- Select any session to review or retry prior generation tasks.
- Use the detail view's return button to return to the list without adding an extra list entry to browser history. Search, sort, and page context are retained. If you opened a detail link directly, return opens the corresponding list.
- If the list cannot load, use **重试**. An unavailable detail shows an error and returns to the list so you can select another session. The same navigation behavior applies to sysadmin session audits.

## Accounts

- Accounts are created manually. Sysadmins create admins and assign an initial password; admins create normal users and assign an initial password.
- Password recovery is handled by admins manually. There is no public forgot-password or invite-email flow.
- Open **设置**, then use **个人资料** or **安全设置** to update your nickname or password. Nicknames allow 1–40 characters; a new password requires at least 8 characters and your current password.
- While a change is saving, the form is disabled. The page shows whether saving succeeded or failed; after a failed password change, correct the existing inputs and try again. Password fields clear after success.

## Admin

- Admins can create users, set or reset user passwords, grant quota within their own remaining quota, inspect usage, and enable/disable users.
- Open a user's **…** menu for details, editing, quota, password reset, and enable/disable actions. On smaller screens, secondary statistics are hidden from the list; open details to inspect them.

## Sysadmin

- Sysadmins manage provider keys, admins, admin passwords, global dashboard metrics, user session audits, **`/sysadmin/generation-entry`（入口开关与用量）**，and their own default provider key preference. Provider types are selected directly while creating a key; there is no separate provider management page.
- Provider keys currently expose 文生图 and 图生图 only. Continuous chat mode is not available.

## Related docs

- [EXPERIMENTS.md](./EXPERIMENTS.md) — generation entry flags and funnel events
- [PRODUCT_SENSE.md](./PRODUCT_SENSE.md) — roles and journeys
- [OPERATIONS.md](./OPERATIONS.md) — sysadmin configuration (operators)
