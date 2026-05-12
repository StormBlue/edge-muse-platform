import { logWarn } from "../log";
import type { AppBindings } from "../../types";

export function getPublicTurnstileSiteKey(env: Pick<AppBindings, "TURNSTILE_SITE_KEY">) {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim();
  return siteKey ? siteKey : null;
}

export async function verifyTurnstile(
  env: AppBindings,
  token?: string,
  ip?: string
): Promise<boolean> {
  if (!token || !env.TURNSTILE_SECRET_KEY) return false;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip ?? ""
      })
    });
    const body = (await response.json().catch(() => ({}))) as { success?: boolean };
    return response.ok && body.success === true;
  } catch (error) {
    logWarn("captcha.turnstile_verify_error", {
      message: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}
