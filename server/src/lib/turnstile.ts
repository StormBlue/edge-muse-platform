/**
 * Cloudflare Turnstile 服务端校验；开发环境可用占位 token 跳过。
 */
import type { AppBindings } from "../types";

export async function verifyTurnstile(
  env: AppBindings,
  token?: string,
  ip?: string
): Promise<boolean> {
  if (env.ENVIRONMENT === "dev" && (!token || token === "dev")) return true;
  if (!token || !env.TURNSTILE_SECRET_KEY) return false;
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: ip ?? ""
    })
  });
  const body = (await response.json()) as { success?: boolean };
  return body.success === true;
}
