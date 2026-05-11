import type { AppBindings } from "../../types";
import type { PromptAssistantTurnInput } from "./schema";
import { systemPrompt, userPrompt } from "./prompts";

const DEFAULT_AI_GATEWAY_ID = "default";

export function requestForModel(
  model: string,
  input: PromptAssistantTurnInput
): Record<string, unknown> {
  if (isGoogleAiModel(model)) {
    return {
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt(input) }]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt(input) }]
      },
      generationConfig: {
        maxOutputTokens: 900,
        temperature: 0.2
      }
    };
  }
  return {
    messages: [
      { role: "system", content: systemPrompt(input) },
      { role: "user", content: userPrompt(input) }
    ],
    max_tokens: 900,
    temperature: 0.2
  };
}

export function optionsForModel(env: AppBindings, model: string) {
  if (isProxiedAiModel(model)) {
    return {
      gateway: {
        id: promptAssistantGatewayId(env),
        metadata: { feature: "prompt_assistant", model }
      }
    };
  }
  return undefined;
}

function isGoogleAiModel(model: string) {
  return model.startsWith("google/");
}

function isProxiedAiModel(model: string) {
  return /^[a-z][a-z0-9-]*\//i.test(model) && !model.startsWith("@cf/");
}

function promptAssistantGatewayId(env: AppBindings) {
  return env.AI_GATEWAY_ID?.trim() || gatewayIdFromUrl(env.AI_GATEWAY_URL) || DEFAULT_AI_GATEWAY_ID;
}

function gatewayIdFromUrl(url: string | undefined) {
  const value = url?.trim();
  if (!value) return undefined;
  const parts = value.split(/[/?#]/).filter(Boolean);
  const versionIndex = parts.findIndex((part) => part === "v1");
  if (versionIndex >= 0 && parts.length > versionIndex + 2) {
    return parts[versionIndex + 2];
  }
  if (!value.includes("/")) return value;
  return undefined;
}
