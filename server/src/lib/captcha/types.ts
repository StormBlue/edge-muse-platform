import { z } from "zod";

export const captchaProviderSchema = z.enum(["tencent", "turnstile", "altcha", "disabled"]);
export const captchaRegionSchema = z.enum(["domestic", "overseas"]);
export const altchaDifficultySchema = z.coerce.number().int().min(10_000).max(200_000);

export type CaptchaProvider = z.infer<typeof captchaProviderSchema>;
export type CaptchaRegion = z.infer<typeof captchaRegionSchema>;

export const captchaProofSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("tencent"),
    ticket: z.string().trim().min(1),
    randstr: z.string().trim().min(1)
  }),
  z.object({
    provider: z.literal("turnstile"),
    token: z.string().trim().min(1)
  }),
  z.object({
    provider: z.literal("altcha"),
    payload: z.string().trim().min(1)
  }),
  z.object({
    provider: z.literal("disabled")
  })
]);

export type CaptchaProof = z.infer<typeof captchaProofSchema>;

export type PublicCaptchaConfig =
  | {
      provider: "tencent";
      region: CaptchaRegion;
      appId: string;
    }
  | {
      provider: "turnstile";
      region: CaptchaRegion;
      siteKey: string;
    }
  | {
      provider: "altcha";
      region: CaptchaRegion;
      challengeUrl: string;
    }
  | {
      provider: "disabled";
      region: CaptchaRegion;
    };
