import type { AppBindings } from "../types";

export type MailTemplate = "password-reset";

export async function sendMail(
  env: AppBindings,
  to: string,
  template: MailTemplate,
  data: Record<string, string>
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(JSON.stringify({ event: "mail.skipped", to, template, data }));
    return;
  }

  const locale = data.locale === "en-US" ? "en-US" : "zh-CN";
  const subject =
    template === "password-reset"
      ? locale === "en-US"
        ? "Reset your Edge Muse password"
        : "重置你的 Edge Muse 密码"
      : "Edge Muse notification";
  const resetUrl = escapeHtml(data.resetUrl ?? "");
  const html =
    template === "password-reset"
      ? locale === "en-US"
        ? `<p>Use this link to reset your password. The link will expire soon.</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
        : `<p>请使用下面的链接重置密码。链接会在有效期后失效。</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
      : "<p>Edge Muse notification</p>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Edge Muse <noreply@example.com>",
      to,
      subject,
      html
    })
  });
  if (!response.ok) throw new Error(`Resend failed: ${response.status}`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
