/**
 * AI 描述助手前端共享类型。
 */
export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantResponse = {
  assistantMessage: string;
  readiness: "collecting" | "ready";
  brief: Record<string, unknown>;
  finalPrompt: string | null;
  recommendedSize: string;
  warnings: string[];
  degraded: boolean;
  degradedReason?: string | null;
};
