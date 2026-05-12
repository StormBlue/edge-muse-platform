import { eq } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../../db/client";
import { users } from "../../db/schema";
import { audit } from "../../lib/audit";
import {
  PROMPT_ASSISTANT_MODEL_OPTIONS,
  getPromptAssistantModelSettings,
  promptAssistantModelSchema,
  savePromptAssistantModelSettings
} from "../../lib/aiModelSettings";
import {
  CAPTCHA_PROVIDER_OPTIONS,
  altchaDifficultySchema,
  captchaProviderSchema,
  getCaptchaSettings,
  saveCaptchaSettings
} from "../../lib/captcha";
import { now } from "../../lib/id";
import { getAssignableProviderKey } from "../../lib/providerKeys";
import { optionalPreferredProviderKeySchema, type SysadminRouter } from "./common";

const sysadminPreferencesPatchSchema = z
  .object({
    preferredProviderKeyId: optionalPreferredProviderKeySchema.optional(),
    promptAssistantModel: promptAssistantModelSchema.optional(),
    captcha: z
      .object({
        domesticProvider: captchaProviderSchema,
        overseasProvider: captchaProviderSchema,
        altchaDifficulty: altchaDifficultySchema.optional()
      })
      .optional()
  })
  .refine(
    (value) =>
      "preferredProviderKeyId" in value || "promptAssistantModel" in value || "captcha" in value,
    {
      message: "At least one preference must be provided"
    }
  );

export function registerSysadminPreferenceRoutes(sysadminRoutes: SysadminRouter) {
  sysadminRoutes.get("/preferences", async (c) => {
    const user = c.get("user");
    return c.json({
      preferredProviderKeyId: user.preferredProviderKeyId ?? null,
      promptAssistantModel: await getPromptAssistantModelSettings(c.env),
      promptAssistantModelOptions: PROMPT_ASSISTANT_MODEL_OPTIONS,
      captcha: await getCaptchaSettings(c.env),
      captchaProviderOptions: CAPTCHA_PROVIDER_OPTIONS
    });
  });

  // 当前登录 sysadmin 个人偏好；这里只允许设置可分配的 provider key，避免 UI 默认值指向不可用密钥。
  sysadminRoutes.patch(
    "/preferences",
    zValidator("json", sysadminPreferencesPatchSchema),
    async (c) => {
      const user = c.get("user");
      const input = c.req.valid("json");
      let preferredProviderKeyId = user.preferredProviderKeyId ?? null;
      let promptAssistantModel = await getPromptAssistantModelSettings(c.env);
      let captcha = await getCaptchaSettings(c.env);
      const auditPayload: Record<string, unknown> = {};

      if ("preferredProviderKeyId" in input) {
        preferredProviderKeyId = input.preferredProviderKeyId ?? null;
        if (preferredProviderKeyId) {
          await getAssignableProviderKey(c.env, preferredProviderKeyId);
        }
        await getDb(c.env)
          .update(users)
          .set({ preferredProviderKeyId, updatedAt: now() })
          .where(eq(users.id, user.id));
        auditPayload.preferredProviderKeyId = preferredProviderKeyId;
      }

      if (input.promptAssistantModel) {
        promptAssistantModel = await savePromptAssistantModelSettings(
          c.env,
          user.id,
          input.promptAssistantModel
        );
        auditPayload.promptAssistantModel = promptAssistantModel.model;
      }

      if (input.captcha) {
        captcha = await saveCaptchaSettings(c.env, user.id, {
          domesticProvider: input.captcha.domesticProvider,
          overseasProvider: input.captcha.overseasProvider,
          altchaDifficulty: input.captcha.altchaDifficulty ?? captcha.altchaDifficulty
        });
        auditPayload.captcha = {
          domesticProvider: captcha.domesticProvider,
          overseasProvider: captcha.overseasProvider,
          altchaDifficulty: captcha.altchaDifficulty
        };
      }

      await audit(c.env, {
        actorId: user.id,
        action: "sys.preferences_update",
        targetType: "sysadmin_preferences",
        targetId: user.id,
        payload: auditPayload
      });

      return c.json({
        ok: true,
        preferredProviderKeyId,
        promptAssistantModel,
        captcha
      });
    }
  );
}
