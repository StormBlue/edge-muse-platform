import { z } from "zod";
import type { AppBindings } from "../../types";

export const PROMPT_ASSISTANT_MODES = ["image2image", "text2image"] as const;
export const PROMPT_ASSISTANT_LOCALES = ["zh-CN", "en-US"] as const;
export const MAX_PROMPT_ASSISTANT_TURNS = 8;

const assistantMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1500)
});

export const promptAssistantTurnSchema = z.object({
  mode: z.enum(PROMPT_ASSISTANT_MODES),
  locale: z.enum(PROMPT_ASSISTANT_LOCALES).default("zh-CN"),
  turnIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_PROMPT_ASSISTANT_TURNS - 1),
  forceFinalize: z.boolean().default(false),
  caseId: z.string().trim().max(120).optional(),
  caseTitle: z.string().trim().max(120).optional(),
  casePromptSummary: z.string().trim().max(1000).optional(),
  casePromptTemplate: z.string().trim().max(4000).optional(),
  caseCategory: z.string().trim().max(120).optional(),
  caseTags: z.array(z.string().trim().max(40)).max(20).optional(),
  caseRecommendedSize: z.string().trim().max(40).optional(),
  provider: z
    .object({
      model: z.string().trim().max(120).optional(),
      supportedSizes: z.array(z.string().trim().max(40)).max(20).optional(),
      maxReferenceImages: z.number().int().min(0).max(10).nullable().optional()
    })
    .optional(),
  referenceBrief: z.string().trim().max(1000).optional(),
  messages: z.array(assistantMessageSchema).max(MAX_PROMPT_ASSISTANT_TURNS * 2)
});

export type PromptAssistantTurnInput = z.infer<typeof promptAssistantTurnSchema>;

export type PromptAssistantResult = {
  assistantMessage: string;
  readiness: "collecting" | "ready";
  brief: {
    useCase?: string;
    subject?: string;
    style?: string;
    scene?: string;
    composition?: string;
    constraints?: string[];
  };
  finalPrompt: string | null;
  recommendedSize: string;
  warnings: string[];
  degraded: boolean;
  degradedReason?: string | null;
  model: string | null;
};

export function isPromptAssistantEnabled(env: Pick<AppBindings, "PROMPT_ASSISTANT_ENABLED">) {
  const value = env.PROMPT_ASSISTANT_ENABLED?.trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "disabled" && value !== "off";
}
