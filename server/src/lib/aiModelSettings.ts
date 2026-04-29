import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { aiModelSettings } from "../db/schema";
import { now } from "./id";
import type { AppBindings } from "../types";

const PROMPT_ASSISTANT_SETTINGS_KEY = "prompt_assistant";

export const DEFAULT_PROMPT_ASSISTANT_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

const PROMPT_ASSISTANT_MODEL_IDS = [
  DEFAULT_PROMPT_ASSISTANT_MODEL,
  "@cf/meta/llama-3.1-8b-instruct-fp8",
  "@cf/meta/llama-3.1-8b-instruct"
] as const;

export type PromptAssistantModelId = (typeof PROMPT_ASSISTANT_MODEL_IDS)[number];

export const PROMPT_ASSISTANT_MODEL_OPTIONS = [
  {
    id: PROMPT_ASSISTANT_MODEL_IDS[0],
    label: "Qwen3 30B A3B FP8",
    description: "适合中文、多语言、复杂指令和提示词改写，作为默认模型。"
  },
  {
    id: PROMPT_ASSISTANT_MODEL_IDS[1],
    label: "Llama 3.1 8B Instruct FP8",
    description: "轻量、稳定，适合作为成本友好的备用模型。"
  },
  {
    id: PROMPT_ASSISTANT_MODEL_IDS[2],
    label: "Llama 3.1 8B Instruct",
    description: "标准版本，成本更高，适合保留兼容性基线。"
  }
] as const satisfies readonly {
  id: PromptAssistantModelId;
  label: string;
  description: string;
}[];

export const promptAssistantModelSchema = z.enum(PROMPT_ASSISTANT_MODEL_IDS);

export type PromptAssistantModelSource = "database" | "environment" | "default";

export type PromptAssistantModelSettingsDto = {
  model: string;
  source: PromptAssistantModelSource;
  updatedBy: string | null;
  updatedAt: number;
};

export async function getPromptAssistantModelSettings(
  env: AppBindings
): Promise<PromptAssistantModelSettingsDto> {
  if (env.DB) {
    try {
      const row = await getDb(env).query.aiModelSettings.findFirst({
        where: eq(aiModelSettings.key, PROMPT_ASSISTANT_SETTINGS_KEY)
      });
      if (row) {
        return {
          model: row.model,
          source: "database",
          updatedBy: row.updatedBy ?? null,
          updatedAt: row.updatedAt
        };
      }
    } catch (error) {
      if (!isMissingSettingsTableError(error)) throw error;
    }
  }
  return fallbackPromptAssistantModelSettings(env);
}

export async function savePromptAssistantModelSettings(
  env: AppBindings,
  actorId: string,
  model: PromptAssistantModelId
): Promise<PromptAssistantModelSettingsDto> {
  const timestamp = now();
  const existing = await getDb(env).query.aiModelSettings.findFirst({
    where: eq(aiModelSettings.key, PROMPT_ASSISTANT_SETTINGS_KEY)
  });
  if (existing) {
    await getDb(env)
      .update(aiModelSettings)
      .set({ model, updatedBy: actorId, updatedAt: timestamp })
      .where(eq(aiModelSettings.key, PROMPT_ASSISTANT_SETTINGS_KEY));
  } else {
    await getDb(env).insert(aiModelSettings).values({
      key: PROMPT_ASSISTANT_SETTINGS_KEY,
      model,
      updatedBy: actorId,
      updatedAt: timestamp
    });
  }
  return {
    model,
    source: "database",
    updatedBy: actorId,
    updatedAt: timestamp
  };
}

export async function resolvePromptAssistantModel(env: AppBindings) {
  const settings = await getPromptAssistantModelSettings(env);
  return settings.model;
}

function fallbackPromptAssistantModelSettings(env: Pick<AppBindings, "PROMPT_ASSISTANT_MODEL">) {
  const envModel = env.PROMPT_ASSISTANT_MODEL?.trim();
  if (envModel) {
    return {
      model: envModel,
      source: "environment" as const,
      updatedBy: null,
      updatedAt: 0
    };
  }
  return {
    model: DEFAULT_PROMPT_ASSISTANT_MODEL,
    source: "default" as const,
    updatedBy: null,
    updatedAt: 0
  };
}

function isMissingSettingsTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table.*ai_model_settings|ai_model_settings.*no such table/i.test(message);
}
