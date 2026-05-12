import type { AppBindings } from "../types";
import {
  getPublicTurnstileSiteKey as getRawPublicTurnstileSiteKey,
  verifyTurnstile as verifyRawTurnstile
} from "./captcha/turnstile";

type TurnstileEnv = Pick<AppBindings, "ENVIRONMENT"> &
  Partial<Pick<AppBindings, "TURNSTILE_SITE_KEY" | "TURNSTILE_SECRET_KEY">>;

export function isTurnstileBypassed(env: TurnstileEnv) {
  return env.ENVIRONMENT === "dev";
}

export function getPublicTurnstileSiteKey(env: TurnstileEnv) {
  if (isTurnstileBypassed(env)) return null;
  return getRawPublicTurnstileSiteKey(env);
}

export async function verifyTurnstile(
  env: AppBindings,
  token?: string,
  ip?: string
): Promise<boolean> {
  if (isTurnstileBypassed(env)) return true;
  return verifyRawTurnstile(env, token, ip);
}
