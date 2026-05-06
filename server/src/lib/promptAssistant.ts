/**
 * AI 提示词助手领域逻辑。
 *
 * 目标是把普通用户的自然语言需求逐步整理成 GPT-Image 2 可用的专业图片 prompt。
 * Workers AI 不可用或输出不合规时，返回静态降级结果，保证页面流程不中断。
 */
import { z } from "zod";
import { DEFAULT_PROMPT_ASSISTANT_MODEL, resolvePromptAssistantModel } from "./aiModelSettings";
import { appError } from "./errors";
import { logWarn } from "./log";
import type { AppBindings } from "../types";

export const PROMPT_ASSISTANT_MODES = ["text2image", "image2image"] as const;
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

const AI_RETRY_DELAYS_MS = [500, 1500, 3500];
const DEFAULT_AI_GATEWAY_ID = "default";

export function isPromptAssistantEnabled(env: Pick<AppBindings, "PROMPT_ASSISTANT_ENABLED">) {
  const value = env.PROMPT_ASSISTANT_ENABLED?.trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "disabled" && value !== "off";
}

export async function runPromptAssistantTurn(
  env: AppBindings,
  input: PromptAssistantTurnInput
): Promise<PromptAssistantResult> {
  assertTotalInputLength(input);
  let model = DEFAULT_PROMPT_ASSISTANT_MODEL;
  let aiText = "";
  try {
    model = await resolvePromptAssistantModel(env);
    const result = await runPromptAssistantModelWithRetry(env, model, input);
    aiText = extractAiText(result);
    const parsed = parseAiResult(aiText, input);
    return { ...parsed, degraded: false, degradedReason: null, model };
  } catch (error) {
    const degradedReason = classifyPromptAssistantError(error);
    logWarn("prompt_assistant.degraded", {
      model,
      turnIndex: input.turnIndex,
      messageCount: input.messages.length,
      aiTextLength: aiText.length,
      degradedReason,
      error: summarizePromptAssistantError(error)
    });
    return { ...fallbackAssistantResult(input), degraded: true, degradedReason, model };
  }
}

async function runPromptAssistantModelWithRetry(
  env: AppBindings,
  model: string,
  input: PromptAssistantTurnInput
) {
  if (!env.AI) throw new Error("Workers AI binding is not configured");
  const request = requestForModel(model, input);
  const options = optionsForModel(env, model);
  for (let attempt = 0; attempt <= AI_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await env.AI.run(model, request, options);
    } catch (error) {
      const willRetry = attempt < AI_RETRY_DELAYS_MS.length && isRetriableAiError(error);
      if (!willRetry) throw error;
      logWarn("prompt_assistant.ai_retry", {
        model,
        attempt: attempt + 1,
        nextAttempt: attempt + 2,
        error: summarizePromptAssistantError(error)
      });
      await wait(AI_RETRY_DELAYS_MS[attempt]);
    }
  }
}

function requestForModel(model: string, input: PromptAssistantTurnInput): Record<string, unknown> {
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

function optionsForModel(env: AppBindings, model: string) {
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

export function assistantLogPayload(
  input: PromptAssistantTurnInput,
  result: PromptAssistantResult
) {
  return {
    mode: input.mode,
    caseId: input.caseId ?? null,
    turnIndex: input.turnIndex,
    messageCount: input.messages.length,
    inputLength: totalInputLength(input),
    outputLength: result.assistantMessage.length + (result.finalPrompt?.length ?? 0),
    readiness: result.readiness,
    degraded: result.degraded,
    degradedReason: result.degradedReason ?? null,
    model: result.model
  };
}

function assertTotalInputLength(input: PromptAssistantTurnInput) {
  if (totalInputLength(input) > 6000) {
    throw appError("PAYLOAD_TOO_LARGE", "Prompt assistant input is too large");
  }
}

function totalInputLength(input: PromptAssistantTurnInput) {
  return (
    input.messages.reduce((sum, message) => sum + message.content.length, 0) +
    (input.caseTitle?.length ?? 0) +
    (input.casePromptSummary?.length ?? 0) +
    (input.casePromptTemplate?.length ?? 0) +
    (input.caseCategory?.length ?? 0) +
    (input.caseTags?.join("").length ?? 0) +
    (input.caseRecommendedSize?.length ?? 0) +
    (input.referenceBrief?.length ?? 0)
  );
}

function systemPrompt(input: PromptAssistantTurnInput) {
  const language = input.locale === "zh-CN" ? "简体中文" : "English";
  return [
    `你是资深视觉创意总监和 GPT-Image 2 生成描述编导，必须使用${language}回答。`,
    "你的目标是用最少轮次把用户的模糊想法推进成可生成图片的描述，而不是机械收集字段。",
    "只帮助 text2image 与 image2image，不处理视频生成。",
    "像自然聊天一样推进，不要提到轮次编号；每次回复最多问 1 个高价值问题。",
    "如果提供了 selectedCase，把案例模板、摘要、分类、标签和推荐画幅视为创作基底。",
    "不要重复询问案例上下文、历史消息或参考图描述已经明确的信息。",
    "禁止泛泛地说“请提供更多信息”“需要更详细的信息”；如果必须追问，问题要具体，并给 2-3 个可选方向帮助用户决策。",
    "只追问会显著改变画面的关键变量，例如主体、核心场景、画面文字、禁忌、必须保留元素；不要追问低价值细节。",
    "当用户说“你来补”“自己补”“按模板”“随便”“类似某种风格”“差不多”等表达时，视为授权你主动补全，不要继续追问。",
    "如果 forceFinalizeRequested 为 true，必须直接输出 ready 和 finalPrompt；缺少的信息要在通用商业视觉、产品原型、图片生成描述最佳实践范围内合理补全，不要继续追问。",
    "如果已有 selectedCase 加至少一个用户创意方向，或已经有主体、场景/风格、文字意图中的任意两项，就可以主动补全合理细节并输出 finalPrompt。",
    "assistantMessage 要先简短确认你理解的方向，再说明下一步；如果 readiness 是 ready，应告诉用户已整理好，可在描述输入框继续微调。",
    "finalPrompt 需要继承案例模板的结构、用途和风格，并融合用户补充，而不是重新发散到无关方向。",
    "finalPrompt 必须面向图片生成，包含用途、主体、场景、构图、风格光线、文字和约束。",
    "warnings 只用于真实风险或限制提醒，例如版权角色、画面文字可能失真、服务商能力限制；不要把普通缺失信息写进 warnings。",
    "不要输出 Markdown；只输出 JSON。",
    'JSON 字段：assistantMessage, readiness("collecting"|"ready"), brief, finalPrompt, recommendedSize, warnings。',
    'brief 必须是对象，不能是字符串；格式：{"useCase":"...","subject":"...","style":"...","scene":"...","composition":"...","constraints":["..."]}。',
    "warnings 必须是字符串数组；如果生成描述还没准备好，finalPrompt 必须是 null。"
  ].join("\n");
}

function userPrompt(input: PromptAssistantTurnInput) {
  return JSON.stringify({
    mode: input.mode,
    turnIndex: input.turnIndex,
    selectedCase: selectedCaseContext(input),
    provider: input.provider,
    referenceBrief: input.referenceBrief,
    conversationGuidance: conversationGuidance(input),
    messages: input.messages
  });
}

function conversationGuidance(input: PromptAssistantTurnInput) {
  const forceFinalizeRequested = input.forceFinalize;
  return {
    forceFinalizeRequested,
    userDelegatedCreativeControl: hasUserDelegatedCreativeControl(input),
    shouldFinishIfReasonable: forceFinalizeRequested || shouldEncourageFinalPrompt(input),
    lastUserMessage: lastUserMessage(input),
    instruction: forceFinalizeRequested
      ? "用户已点击直接生成描述。请基于当前状态直接输出 ready 和 finalPrompt，信息不足时主动补全合理细节。"
      : "如果 shouldFinishIfReasonable 为 true，请优先输出 ready 和 finalPrompt；只有缺少会导致画面完全跑偏的核心信息时才追问。"
  };
}

function selectedCaseContext(input: PromptAssistantTurnInput) {
  if (
    !input.caseId &&
    !input.caseTitle &&
    !input.casePromptSummary &&
    !input.casePromptTemplate &&
    !input.caseCategory &&
    !input.caseTags?.length &&
    !input.caseRecommendedSize
  ) {
    return undefined;
  }
  return {
    id: input.caseId,
    title: input.caseTitle,
    category: input.caseCategory,
    tags: input.caseTags,
    recommendedSize: input.caseRecommendedSize,
    promptSummary: input.casePromptSummary,
    promptTemplate: input.casePromptTemplate
  };
}

function extractAiText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const value = result as { response?: unknown; result?: unknown; text?: unknown };
  if (typeof value.response === "string") return value.response;
  if (typeof value.text === "string") return value.text;
  if (typeof value.result === "string") return value.result;
  return JSON.stringify(result);
}

function parseAiResult(
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

function normalizeAiBrief(value: unknown) {
  if (typeof value === "string") {
    return { subject: value.trim().slice(0, 300) };
  }
  return value;
}

function normalizeNullableString(value: unknown) {
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

function normalizeWarnings(value: unknown) {
  if (typeof value === "string") return value.trim() ? [value] : [];
  return value;
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function summarizePromptAssistantError(error: unknown) {
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

function classifyPromptAssistantError(error: unknown) {
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

function isRetriableAiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /network connection lost|error code:\s*1031/i.test(message);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fallbackAssistantResult(
  input: PromptAssistantTurnInput
): Omit<PromptAssistantResult, "degraded" | "model"> {
  const enough = shouldFallbackFinalize(input);
  const brief = summarizeMessages(input);
  const recommendedSize = recommendedSizeForTurn(input);
  if (!enough) {
    return {
      assistantMessage: nextQuestion(input),
      readiness: "collecting",
      brief,
      finalPrompt: null,
      recommendedSize,
      warnings: ["描述助手暂时按通用模板继续整理，最终生成描述会偏保守。"],
      degradedReason: null
    };
  }
  return {
    assistantMessage:
      "信息已经足够，我先给你一版可直接生成的专业描述，你还可以继续补充细节让我调整。",
    readiness: "ready",
    brief,
    finalPrompt: buildFallbackFinalPrompt(input, brief),
    recommendedSize,
    warnings: ["已按通用模板生成描述，请人工确认文字和品牌元素。"],
    degradedReason: null
  };
}

function summarizeMessages(input: PromptAssistantTurnInput): PromptAssistantResult["brief"] {
  const userText = meaningfulUserMessages(input).join("；").slice(0, 600);
  const caseStyle = [
    input.casePromptSummary,
    input.caseTags?.length ? `标签：${input.caseTags.join("、")}` : undefined
  ]
    .filter(Boolean)
    .join("；");
  return {
    useCase: input.caseTitle
      ? [input.caseTitle, input.caseCategory ? `分类：${input.caseCategory}` : undefined]
          .filter(Boolean)
          .join("；")
      : "自由创作",
    subject: userText || fallbackCreativeSubject(input),
    style: caseStyle || (input.casePromptTemplate ? "参考所选案例模板" : "待确认"),
    scene:
      input.referenceBrief || (input.caseCategory ? `适合${input.caseCategory}场景` : "待确认"),
    composition: input.caseRecommendedSize
      ? `遵循案例推荐画幅 ${input.caseRecommendedSize}，保持主体清晰、层次明确`
      : "保持主体清晰、层次明确",
    constraints: ["无水印", "无无关 Logo", "无额外乱码文字"]
  };
}

function recommendedSizeForTurn(input: PromptAssistantTurnInput, aiRecommendedSize?: string) {
  return (
    firstNonEmptyString(
      aiRecommendedSize,
      input.caseRecommendedSize,
      input.provider?.supportedSizes?.[0]
    ) ?? "1024x1024"
  );
}

function nextQuestion(input: PromptAssistantTurnInput) {
  if (input.casePromptTemplate) {
    const caseTitle = input.caseTitle ?? "这个案例";
    const questions =
      input.mode === "image2image"
        ? [
            `我会沿用「${caseTitle}」的结构。参考图里最需要保留的是主体、构图、品牌标识还是整体氛围？`,
            "这次主要想改变哪一处：背景、光线、材质、文字，还是整体风格？",
            "如果没有禁忌信息，我就按案例风格补全并整理生成描述。有没有绝对不能出现或不能改变的内容？"
          ]
        : [
            `我会按「${caseTitle}」来做。画面最核心的主体是什么？`,
            "主体我记下了。画面里需要出现文字吗？如果需要，请逐字写出；不需要我会默认不加文字。",
            "我可以基于案例补全构图、光线和氛围。有没有绝对不能出现的元素？"
          ];
    return questions[Math.min(input.turnIndex, questions.length - 1)];
  }
  const questions =
    input.mode === "image2image"
      ? [
          "你希望参考图里哪些元素必须保留？例如人物身份、产品形状、Logo、构图或颜色。",
          "这次主要想改变什么？例如背景、光线、服装、风格、文案或材质。",
          "参考图在新图里扮演什么角色：主体、构图、风格、品牌还是氛围？",
          "有没有绝对不能改变或不能出现的内容？",
          "你想要保守改图还是大胆重塑？"
        ]
      : [
          "这张图准备用在什么场景？例如头像、商品图、海报、封面或社媒内容。",
          "画面主体是什么？请补充主体的关键外观、动作或卖点。",
          "你想要哪种视觉风格？例如真实摄影、3D、插画、电影感或国风。",
          "场景、背景、光线和情绪希望是什么样？",
          "图片里是否需要出现文字？如果需要，请逐字写出来。"
        ];
  return questions[Math.min(input.turnIndex, questions.length - 1)];
}

function shouldEncourageFinalPrompt(input: PromptAssistantTurnInput) {
  if (input.forceFinalize) return true;
  if (hasUserDelegatedCreativeControl(input)) return true;
  if (input.turnIndex >= 5 || input.messages.length >= 6) return true;
  const userMessages = input.messages.filter((message) => message.role === "user");
  return Boolean(input.casePromptTemplate && userMessages.length >= 2);
}

function shouldFallbackFinalize(input: PromptAssistantTurnInput) {
  if (input.forceFinalize) return true;
  if (hasUserDelegatedCreativeControl(input)) return true;
  if (input.turnIndex >= 5 || input.messages.length >= 10) return true;
  return false;
}

function hasUserDelegatedCreativeControl(input: PromptAssistantTurnInput) {
  const text = lastUserMessage(input);
  if (
    /你(来|自己|帮我)?补|自己补|按.*模板|随便|都可以|差不多|照着|你看着办|你决定|你来定|不用问|直接生成|现在生成|生成\s*(Prompt|提示词|描述|生成描述)|整理\s*(Prompt|提示词|描述|生成描述)/i.test(
      text
    )
  ) {
    return true;
  }
  const userMessageCount = input.messages.filter((message) => message.role === "user").length;
  return Boolean(input.casePromptTemplate && userMessageCount >= 2 && /类似|像.*风格/.test(text));
}

function lastUserMessage(input: PromptAssistantTurnInput) {
  return (
    [...input.messages]
      .reverse()
      .find((message) => message.role === "user")
      ?.content.trim() ?? ""
  );
}

function meaningfulUserMessages(input: PromptAssistantTurnInput) {
  return input.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter((content) => content && !isFinalizeOnlyMessage(content));
}

function isFinalizeOnlyMessage(content: string) {
  return /^(直接|现在|立即|开始)?\s*(生成|整理)\s*(Prompt|提示词|描述|生成描述)?吧?$/i.test(
    content
  );
}

function fallbackCreativeSubject(input: PromptAssistantTurnInput) {
  if (input.caseTitle) {
    return `由 AI 基于「${input.caseTitle}」案例模板和通用视觉规范自由发挥，补全清晰主体与关键画面细节`;
  }
  return "由 AI 基于通用视觉创作规范自由发挥，设定清晰主体、场景和关键画面细节";
}

function buildFallbackFinalPrompt(
  input: PromptAssistantTurnInput,
  brief: PromptAssistantResult["brief"]
) {
  const base =
    input.mode === "image2image" ? "基于参考图进行图像编辑。" : "生成一张高质量 GPT-Image 2 图片。";
  return [
    base,
    input.casePromptTemplate ? `案例模板基底：${input.casePromptTemplate}` : undefined,
    `用途：${brief.useCase ?? "图片创作"}。`,
    `主体：${brief.subject ?? "清晰主体"}。`,
    `场景：${brief.scene ?? "干净、有层次的背景"}。`,
    `构图：${brief.composition ?? "主体突出，画面有留白和纵深"}。`,
    `风格与光线：${brief.style ?? "专业、统一、细节真实"}，光线自然，色彩协调。`,
    `文字：${fallbackTextInstruction(input)}。`,
    `约束：${(brief.constraints ?? []).join("、")}。`
  ]
    .filter(Boolean)
    .join("\n");
}

function fallbackTextInstruction(input: PromptAssistantTurnInput) {
  const textMessages = input.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter((content) =>
      /文字|文案|标题|主标题|片名|写上|显示|加字|不要文字|不加文字|无文字/i.test(content)
    );
  if (!textMessages.length) return "如用户未明确要求，则画面内不出现文字";
  return `按用户明确要求处理：${Array.from(new Set(textMessages)).join("；").slice(0, 300)}`;
}
