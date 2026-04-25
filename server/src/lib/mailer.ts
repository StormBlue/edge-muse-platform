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

  const subject =
    template === "password-reset" ? "Edge Muse password reset" : "Edge Muse notification";
  const html =
    template === "password-reset"
      ? `<p>Use this link to reset your password:</p><p><a href="${data.resetUrl}">${data.resetUrl}</a></p>`
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
