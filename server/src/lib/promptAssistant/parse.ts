import { z } from "zod";
import { nextQuestion, recommendedSizeForTurn, shouldFallbackFinalize } from "./fallback";
import type { PromptAssistantResult, PromptAssistantTurnInput } from "./schema";

const aiResultSchema = z.object({
  assistantMessage: z.string().trim().max(1500).optional(),
  message: z.string().trim().max(1500).optional(),
  question: z.string().trim().max(1500).optional(),
  readiness: z.enum(["collecting", "ready"]).optional(),
  brief: z.preprocess(
    normalizeAiBrief,
    z
      .object({
        useCase: z.string().max(200).optional(),
        subject: z.string().max(300).optional(),
        style: z.string().max(300).optional(),
        scene: z.string().max(300).optional(),
        composition: z.string().max(300).optional(),
        constraints: z.array(z.string().max(120)).max(10).optional()
      })
      .default({})
  ),
  finalPrompt: z.preprocess(
    normalizeNullableString,
    z.string().trim().max(1500).nullable().default(null)
  ),
  recommendedSize: z.string().trim().max(40).optional(),
  warnings: z.preprocess(normalizeWarnings, z.array(z.string().trim().max(160)).max(6).default([]))
});
export function extractAiText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const value = result as { response?: unknown; result?: unknown; text?: unknown };
  if (typeof value.response === "string") return value.response;
  if (typeof value.text === "string") return value.text;
  if (typeof value.result === "string") return value.result;
  return JSON.stringify(result);
}

export function parseAiResult(
  text: string,
  input: PromptAssistantTurnInput
): Omit<PromptAssistantResult, "degraded" | "model"> {
  const raw = text.trim();
  const payload = parseAiPayload(raw);
  const parsed = aiResultSchema.parse(payload);
  const finalPrompt = parsed.finalPrompt?.trim() ? parsed.finalPrompt : null;
  if (!finalPrompt && input.forceFinalize) {
    throw new Error("Workers AI kept collecting after the user requested final prompt generation");
  }
  if (!finalPrompt && shouldFallbackFinalize(input)) {
    throw new Error("Workers AI kept collecting after repeated prompt context was provided");
  }
  return {
    assistantMessage:
      firstNonEmptyString(parsed.assistantMessage, parsed.message, parsed.question) ??
      nextQuestion(input),
    readiness: finalPrompt ? (parsed.readiness ?? "ready") : "collecting",
    brief: parsed.brief,
    finalPrompt,
    recommendedSize: recommendedSizeForTurn(input, parsed.recommendedSize),
    warnings: parsed.warnings,
    degradedReason: null
  };
}

function parseAiPayload(raw: string): Record<string, unknown> {
  const jsonPayload = tryParseJsonPayload(raw);
  if (isAiResultLike(jsonPayload)) return jsonPayload;
  const loosePayload = parseLooseAiPayload(raw);
  if (isAiResultLike(loosePayload)) return loosePayload;
  throw new Error("Workers AI did not return a structured prompt assistant result");
}

function tryParseJsonPayload(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function parseLooseAiPayload(raw: string): Record<string, unknown> {
  return {
    assistantMessage: parseLooseField(raw, "assistantMessage"),
    readiness: parseLooseField(raw, "readiness"),
    brief: parseLooseField(raw, "brief"),
    finalPrompt: parseLooseField(raw, "finalPrompt"),
    recommendedSize: parseLooseField(raw, "recommendedSize"),
    warnings: parseLooseField(raw, "warnings")
  };
}

function parseLooseField(raw: string, field: string) {
  const match = new RegExp(
    `(?:^|\\n)${field}\\s*:\\s*([\\s\\S]*?)(?=\\n[A-Za-z][A-Za-z0-9_]*\\s*:|$)`
  ).exec(raw);
  if (!match) return undefined;
  const value = match[1].trim().replace(/,$/, "");
  if (!value) return undefined;
  if (value === "null") return null;
  if (value.startsWith("{") && value.includes("}")) {
    return tryParseJsonPayload(value);
  }
  if (value.startsWith("[") && value.includes("]")) {
    try {
      return JSON.parse(value.slice(0, value.lastIndexOf("]") + 1));
    } catch {
      return value;
    }
  }
  if (value.startsWith('"') && value.includes('"', 1)) {
    try {
      return JSON.parse(value.slice(0, value.lastIndexOf('"') + 1));
    } catch {
      return value.slice(1, value.lastIndexOf('"'));
    }
  }
  return value;
}

function isAiResultLike(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return ["assistantMessage", "message", "question", "readiness", "brief", "finalPrompt"].some(
    (key) => key in value
  );
}

export function normalizeAiBrief(value: unknown) {
  if (typeof value === "string") {
    return { subject: value.trim().slice(0, 300) };
  }
  return value;
}

export function normalizeNullableString(value: unknown) {
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

export function normalizeWarnings(value: unknown) {
  if (typeof value === "string") return value.trim() ? [value] : [];
  return value;
}

export function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}
