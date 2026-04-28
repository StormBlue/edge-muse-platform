/**
 * Cloudflare Turnstile 服务端校验。
 *
 * 本地开发必须完全跳过：Wrangler dev 的浏览器来源是 localhost，真实 Turnstile
 * site key 容易触发 110200 之类的域名不匹配错误；生产环境仍失败关闭。
 */
import type { AppBindings } from "../types";

type TurnstileEnv = Pick<AppBindings, "ENVIRONMENT"> &
  Partial<Pick<AppBindings, "TURNSTILE_SITE_KEY" | "TURNSTILE_SECRET_KEY">>;

export function isTurnstileBypassed(env: TurnstileEnv) {
  return env.ENVIRONMENT === "dev";
}

export function getPublicTurnstileSiteKey(env: TurnstileEnv) {
  if (isTurnstileBypassed(env)) return null;
  const siteKey = env.TURNSTILE_SITE_KEY?.trim();
  return siteKey ? siteKey : null;
}

export async function verifyTurnstile(
  env: AppBindings,
  token?: string,
  ip?: string
): Promise<boolean> {
  if (isTurnstileBypassed(env)) return true;
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
