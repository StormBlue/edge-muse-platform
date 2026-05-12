import type { AppContext } from "../../types";
import type { CaptchaRegion } from "./types";

const DOMESTIC_COUNTRY_CODES = new Set(["CN"]);

export function resolveCaptchaRegion(c: AppContext): CaptchaRegion {
  const country = c.req.header("CF-IPCountry")?.trim().toUpperCase();
  if (country && DOMESTIC_COUNTRY_CODES.has(country)) return "domestic";
  return "overseas";
}
