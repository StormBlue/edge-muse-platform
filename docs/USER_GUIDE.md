# Edge Muse User Guide

## Workspace and AI image

1. Depending on **Generation entry** settings, you may see **工作台** (`/workspace`), **AI 图像生成** (`/ai-image`), or both. Sysadmins always see both; normal users follow [`EXPERIMENTS.md`](./EXPERIMENTS.md).
2. Open **工作台** or **AI 图像生成** from the sidebar.
3. Choose an available mode. The visible modes and sizes follow the provider key assigned to your account.
4. Enter a prompt, choose size and image count, then click **生成**.
5. For 图生图, drag, paste, or select reference images. Large images are compressed before upload. The visible upload limit follows the provider key assigned to your account.
6. Click a generated image to open the viewer. It supports zoom, previous/next image, download and prompt copy. Message deletion remains available where the surrounding view permits it; the AI studio viewer does not delete messages.

- AI image generation opens directly in the editor. **选择案例** opens the case library when needed; **新建创作** clears the current creation and opens a blank URL. Browser Back and Forward follow the task, case or source in the URL. Unsubmitted prompts are not saved across refreshes.
- Opening a specific workspace session keeps that session selected, even when another task is running. Opening the workspace without a session can resume the active task for a normal user. Existing limits on starting another task still apply.

## Creative requirements and AI assistant

- Fill in the subject, purpose, style, what must stay, and what should change. Use **加入提示词** to add those requirements to the prompt, or discuss them with **AI 助手**.
- Assistant suggestions appear beside the original prompt for review. Edit the suggestion, explicitly accept it, or select individual paragraphs to append. Accepting a suggestion keeps your selected image size. If you edited the prompt while waiting, replacing it requires another confirmation. Suggestions never start generation automatically.
- Use the editor's undo action to reverse the last prompt replacement. You can switch between the editor and assistant without discarding the current conversation.

## Tasks and quota

- Open **生成任务** in the header to see recent and active tasks, including tasks started on another creation page. States distinguish waiting, starting, generating and the final outcome; elapsed time is not an estimated completion time.
- **取消排队** is available before execution starts. Successful cancellation returns the outstanding reserved quota exactly once. If execution starts first, cancellation is rejected and the display refreshes. Running tasks cannot be cancelled through this control.
- **预扣** and **退还** show actual quota transactions. Final tasks also show net **消耗**. A failed task may still have a charge depending on the existing failure/refund rules; cancellation does not mean all failures are free.
- While this app is visible, task states refresh automatically and completion appears as an in-app notification. Hidden or closed browser pages do not receive system push notifications. If refresh fails, the last known state remains visible with a retry action.

## Continue from a result

- **沿用参数** loads the source prompt, parameters and available original references for review. **作为参考图** starts image-to-image creation with the selected result as its reference, when the provider supports it. Neither action submits automatically.
- Existing images do not need uploading again. Available modes, sizes and image counts are checked against your current account/provider; changes are shown before you submit. When original references are missing, add replacements, explicitly confirm using the current references, or switch to text-to-image. Image-to-image always requires at least one reference.
- The new task records its source task and, when relevant, source image. The original result remains in its original session. In AI image generation, select a comparison image to inspect the two results side by side, including on a phone. Open either image for a larger view.
- These actions use the AI image entry when available and otherwise open the workspace. Images or source tasks you cannot access cannot be reused.

## Navigation on desktop and mobile

- On desktop, collapse the sidebar to give images and forms more room. Narrow windows stack content vertically; wider screens show more history and audit items per row.
- On a phone, use the bottom navigation for primary pages and **更多** for the full menu available to your account. Close the menu using its close button, the backdrop, or Escape when using a keyboard.
- In AI image generation, switch between **创作** and **结果** on a phone; switching preserves the current editor state. Wider screens show both panels together.
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
