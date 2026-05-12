import { appError } from "../errors";
import { logWarn } from "../log";
import { resolveCaptchaProvider } from "./settings";
import { verifyTencentCaptcha } from "./tencent";
import { getPublicTurnstileSiteKey, verifyTurnstile } from "./turnstile";
import type { AppBindings } from "../../types";
import type { CaptchaProof, CaptchaRegion, PublicCaptchaConfig } from "./types";

export type { CaptchaProof, CaptchaProvider, CaptchaRegion, PublicCaptchaConfig } from "./types";
export { CAPTCHA_PROVIDER_OPTIONS, getCaptchaSettings, saveCaptchaSettings } from "./settings";
export { captchaProofSchema, captchaProviderSchema } from "./types";

export async function getPublicCaptchaConfig(
  env: AppBindings,
  region: CaptchaRegion
): Promise<PublicCaptchaConfig> {
  const provider = await resolveCaptchaProvider(env, region);
  if (provider === "disabled") {
    return { provider: "disabled", region };
  }
  if (provider === "tencent") {
    const appId = env.TENCENT_CAPTCHA_APP_ID?.trim();
    if (!appId) {
      logWarn("captcha.tencent_public_config_missing_app_id", { region });
    }
    return { provider: "tencent", region, appId: appId ?? "" };
  }
  const siteKey = getPublicTurnstileSiteKey(env);
  if (!siteKey) {
    logWarn("captcha.turnstile_public_config_missing_site_key", { region });
  }
  return { provider: "turnstile", region, siteKey: siteKey ?? "" };
}

export async function verifyCaptcha(
  env: AppBindings,
  input: {
    expectedRegion: CaptchaRegion;
    proof?: CaptchaProof;
    ip?: string;
  }
) {
  const expectedProvider = await resolveCaptchaProvider(env, input.expectedRegion);
  if (expectedProvider === "disabled") return true;
  if (!input.proof || input.proof.provider !== expectedProvider) {
    throw appError("FORBIDDEN", "Captcha verification failed");
  }
  if (input.proof.provider === "tencent") {
    return verifyTencentCaptcha(env, {
      ticket: input.proof.ticket,
      randstr: input.proof.randstr,
      ip: input.ip
    });
  }
  return verifyTurnstile(env, input.proof.token, input.ip);
}
