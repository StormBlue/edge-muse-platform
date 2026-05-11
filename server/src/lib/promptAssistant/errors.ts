import { z } from "zod";

export function summarizePromptAssistantError(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      name: "ZodError",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message
      }))
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }
  return { name: typeof error };
}

export function classifyPromptAssistantError(error: unknown) {
  if (error instanceof z.ZodError) return "invalid_ai_payload";
  if (error instanceof Error) {
    const message = error.message;
    if (/Workers AI binding is not configured/i.test(message)) return "ai_binding_missing";
    if (/structured prompt assistant result/i.test(message)) return "unstructured_ai_payload";
    if (/after the user requested final prompt generation/i.test(message)) {
      return "force_finalize_without_prompt";
    }
    if (/after repeated prompt context/i.test(message)) return "repeated_context_without_prompt";
    if (isRetriableAiError(error)) return "ai_runtime_error";
    return "prompt_assistant_error";
  }
  return "unknown_error";
}

export function isRetriableAiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /network connection lost|error code:\s*1031/i.test(message);
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
