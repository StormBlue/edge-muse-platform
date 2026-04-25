import type { AppBindings } from "../types";

export type MailTemplate = "ops-alert";

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

  const subject = data.subject || "Edge Muse operations alert";
  const html = `<pre>${escapeHtml(data.body ?? "")}</pre>`;

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
