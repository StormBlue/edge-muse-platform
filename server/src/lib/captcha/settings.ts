import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { captchaSettings } from "../../db/schema";
import { now } from "../id";
import {
  altchaDifficultySchema,
  captchaProviderSchema,
  type CaptchaProvider,
  type CaptchaRegion
} from "./types";
import type { AppBindings } from "../../types";

const CAPTCHA_SETTINGS_KEY = "login";
export const DEFAULT_ALTCHA_DIFFICULTY = 50_000;

export const CAPTCHA_PROVIDER_OPTIONS = [
  {
    id: "tencent",
    label: "Tencent Cloud Captcha",
    description: "国内链路优先，浏览器加载腾讯云验证码并由 Worker 调腾讯云 API 二次校验。"
  },
  {
    id: "turnstile",
    label: "Cloudflare Turnstile",
    description: "Cloudflare 官方验证码，适合海外访问路径。"
  },
  {
    id: "altcha",
    label: "ALTCHA",
    description: "开源自托管 PoW 验证码，浏览器求解，Worker 只负责签发与校验。"
  },
  {
    id: "disabled",
    label: "Disabled",
    description: "关闭登录人机校验，仅保留登录限流和账号密码校验。"
  }
] as const satisfies readonly {
  id: CaptchaProvider;
  label: string;
  description: string;
}[];

export type CaptchaSettingsSource = "database" | "environment" | "default";

export type CaptchaSettingsDto = {
  domesticProvider: CaptchaProvider;
  overseasProvider: CaptchaProvider;
  domesticAltchaDifficulty: number;
  overseasAltchaDifficulty: number;
  /** @deprecated 兼容旧客户端；新代码应使用分地区难度。 */
  altchaDifficulty: number;
  source: CaptchaSettingsSource;
  updatedBy: string | null;
  updatedAt: number;
};

export type CaptchaSettingsPatchInput = {
  domesticProvider: CaptchaProvider;
  overseasProvider: CaptchaProvider;
  domesticAltchaDifficulty: number;
  overseasAltchaDifficulty: number;
};

export async function getCaptchaSettings(env: AppBindings): Promise<CaptchaSettingsDto> {
  if (env.DB) {
    try {
      const row = await getDb(env).query.captchaSettings.findFirst({
        where: eq(captchaSettings.key, CAPTCHA_SETTINGS_KEY)
      });
      if (row) {
        const domesticAltchaDifficulty = normalizeAltchaDifficulty(
          row.domesticAltchaDifficulty,
          row.altchaDifficulty
        );
        const overseasAltchaDifficulty = normalizeAltchaDifficulty(
          row.overseasAltchaDifficulty,
          row.altchaDifficulty
        );
        return {
          domesticProvider: row.domesticProvider,
          overseasProvider: row.overseasProvider,
          domesticAltchaDifficulty,
          overseasAltchaDifficulty,
          altchaDifficulty: domesticAltchaDifficulty,
          source: "database",
          updatedBy: row.updatedBy ?? null,
          updatedAt: row.updatedAt
        };
      }
    } catch (error) {
      if (!isMissingSettingsTableError(error)) throw error;
    }
  }
  return fallbackCaptchaSettings(env);
}

export async function saveCaptchaSettings(
  env: AppBindings,
  actorId: string,
  input: CaptchaSettingsPatchInput
): Promise<CaptchaSettingsDto> {
  const timestamp = now();
  const existing = await getDb(env).query.captchaSettings.findFirst({
    where: eq(captchaSettings.key, CAPTCHA_SETTINGS_KEY)
  });
  if (existing) {
    await getDb(env)
      .update(captchaSettings)
      .set({
        domesticProvider: input.domesticProvider,
        overseasProvider: input.overseasProvider,
        altchaDifficulty: input.domesticAltchaDifficulty,
        domesticAltchaDifficulty: input.domesticAltchaDifficulty,
        overseasAltchaDifficulty: input.overseasAltchaDifficulty,
        updatedBy: actorId,
        updatedAt: timestamp
      })
      .where(eq(captchaSettings.key, CAPTCHA_SETTINGS_KEY));
  } else {
    await getDb(env).insert(captchaSettings).values({
      key: CAPTCHA_SETTINGS_KEY,
      domesticProvider: input.domesticProvider,
      overseasProvider: input.overseasProvider,
      altchaDifficulty: input.domesticAltchaDifficulty,
      domesticAltchaDifficulty: input.domesticAltchaDifficulty,
      overseasAltchaDifficulty: input.overseasAltchaDifficulty,
      updatedBy: actorId,
      updatedAt: timestamp
    });
  }
  return {
    ...input,
    altchaDifficulty: input.domesticAltchaDifficulty,
    source: "database",
    updatedBy: actorId,
    updatedAt: timestamp
  };
}

export async function resolveCaptchaProvider(
  env: AppBindings,
  region: CaptchaRegion
): Promise<CaptchaProvider> {
  const settings = await getCaptchaSettings(env);
  if (env.ENVIRONMENT === "dev" && settings.source !== "database") return "disabled";
  return region === "domestic" ? settings.domesticProvider : settings.overseasProvider;
}

function fallbackCaptchaSettings(
  env: Pick<
    AppBindings,
    "CAPTCHA_DOMESTIC_PROVIDER" | "CAPTCHA_OVERSEAS_PROVIDER" | "ALTCHA_DEFAULT_DIFFICULTY"
  >
): CaptchaSettingsDto {
  const domesticProvider = parseProvider(env.CAPTCHA_DOMESTIC_PROVIDER, "tencent");
  const overseasProvider = parseProvider(env.CAPTCHA_OVERSEAS_PROVIDER, "turnstile");
  const altchaDifficulty = parseAltchaDifficulty(env.ALTCHA_DEFAULT_DIFFICULTY);
  const hasEnvProvider = Boolean(
    env.CAPTCHA_DOMESTIC_PROVIDER || env.CAPTCHA_OVERSEAS_PROVIDER || env.ALTCHA_DEFAULT_DIFFICULTY
  );
  return {
    domesticProvider,
    overseasProvider,
    domesticAltchaDifficulty: altchaDifficulty,
    overseasAltchaDifficulty: altchaDifficulty,
    altchaDifficulty,
    source: hasEnvProvider ? "environment" : "default",
    updatedBy: null,
    updatedAt: 0
  };
}

function parseProvider(value: string | undefined, fallback: CaptchaProvider): CaptchaProvider {
  const parsed = captchaProviderSchema.safeParse(value?.trim());
  return parsed.success ? parsed.data : fallback;
}

function parseAltchaDifficulty(value: string | undefined) {
  const parsed = altchaDifficultySchema.safeParse(value?.trim());
  return parsed.success ? parsed.data : DEFAULT_ALTCHA_DIFFICULTY;
}

function normalizeAltchaDifficulty(value: number, fallback: number) {
  const parsed = altchaDifficultySchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const fallbackParsed = altchaDifficultySchema.safeParse(fallback);
  return fallbackParsed.success ? fallbackParsed.data : DEFAULT_ALTCHA_DIFFICULTY;
}

function isMissingSettingsTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table.*captcha_settings|captcha_settings.*no such table/i.test(message);
}
