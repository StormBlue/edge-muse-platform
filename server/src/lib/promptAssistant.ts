/**
 * AI 提示词助手领域逻辑。
 *
 * 目标是把普通用户的自然语言需求逐步整理成 GPT-Image 2 可用的专业图片 prompt。
 * Workers AI 不可用或输出不合规时，返回静态降级结果，保证页面流程不中断。
 */
import { z } from "zod";
import { appError } from "./errors";
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
  messages: z
    .array(assistantMessageSchema)
    .min(1)
    .max(MAX_PROMPT_ASSISTANT_TURNS * 2)
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
  model: string | null;
};

const aiResultSchema = z.object({
  assistantMessage: z.string().trim().min(1).max(1500),
  readiness: z.enum(["collecting", "ready"]),
  brief: z
    .object({
      useCase: z.string().max(200).optional(),
      subject: z.string().max(300).optional(),
      style: z.string().max(300).optional(),
      scene: z.string().max(300).optional(),
      composition: z.string().max(300).optional(),
      constraints: z.array(z.string().max(120)).max(10).optional()
    })
    .default({}),
  finalPrompt: z.string().trim().max(1500).nullable().default(null),
  recommendedSize: z.string().trim().max(40).default("1024x1024"),
  warnings: z.array(z.string().trim().max(160)).max(6).default([])
});

const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";

export function isPromptAssistantEnabled(env: Pick<AppBindings, "PROMPT_ASSISTANT_ENABLED">) {
  const value = env.PROMPT_ASSISTANT_ENABLED?.trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "disabled" && value !== "off";
}

export async function runPromptAssistantTurn(
  env: AppBindings,
  input: PromptAssistantTurnInput
): Promise<PromptAssistantResult> {
  assertTotalInputLength(input);
  const model = env.PROMPT_ASSISTANT_MODEL || DEFAULT_MODEL;
  try {
    if (!env.AI) throw new Error("Workers AI binding is not configured");
    const result = await env.AI.run(model, {
      messages: [
        { role: "system", content: systemPrompt(input) },
        { role: "user", content: userPrompt(input) }
      ],
      max_tokens: 900
    });
    const parsed = parseAiResult(extractAiText(result));
    return { ...parsed, degraded: false, model };
  } catch {
    return { ...fallbackAssistantResult(input), degraded: true, model: null };
  }
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
    `你是 GPT-Image 2 图片生成提示词顾问，必须使用${language}回答。`,
    "只帮助 text2image 与 image2image，不处理视频生成或连续 chat 模式。",
    "像自然聊天一样追问，不要提到轮次编号；最多追问 8 次，信息足够就输出 finalPrompt。",
    "如果提供了 selectedCase，把案例模板、摘要、分类、标签和推荐画幅视为创作基底。",
    "围绕所选案例只追问缺失的用户变量，例如主体、品牌/产品、文案、受众、禁忌和必须保留的细节；不要重复询问案例上下文已经明确的信息。",
    "finalPrompt 需要继承案例模板的结构、用途和风格，并融合用户补充，而不是重新发散到无关方向。",
    "finalPrompt 必须面向图片生成，包含用途、主体、场景、构图、风格光线、文字和约束。",
    "不要输出 Markdown；只输出 JSON。",
    'JSON 字段：assistantMessage, readiness("collecting"|"ready"), brief, finalPrompt, recommendedSize, warnings。'
  ].join("\n");
}

function userPrompt(input: PromptAssistantTurnInput) {
  return JSON.stringify({
    mode: input.mode,
    turnIndex: input.turnIndex,
    selectedCase: selectedCaseContext(input),
    provider: input.provider,
    referenceBrief: input.referenceBrief,
    messages: input.messages
  });
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

function parseAiResult(text: string): Omit<PromptAssistantResult, "degraded" | "model"> {
  const raw = text.trim();
  const jsonText = raw.startsWith("{")
    ? raw
    : raw.slice(Math.max(0, raw.indexOf("{")), raw.lastIndexOf("}") + 1);
  return aiResultSchema.parse(JSON.parse(jsonText));
}

function fallbackAssistantResult(
  input: PromptAssistantTurnInput
): Omit<PromptAssistantResult, "degraded" | "model"> {
  const enough = input.turnIndex >= 5 || input.messages.length >= 6;
  const brief = summarizeMessages(input);
  const recommendedSize = input.provider?.supportedSizes?.[0] ?? "1024x1024";
  if (!enough) {
    return {
      assistantMessage: nextQuestion(input),
      readiness: "collecting",
      brief,
      finalPrompt: null,
      recommendedSize,
      warnings: ["当前使用静态降级助手，最终 prompt 会偏保守。"]
    };
  }
  return {
    assistantMessage:
      "信息已经足够，我先给你一版可直接生成的专业 prompt，你还可以继续补充细节让我调整。",
    readiness: "ready",
    brief,
    finalPrompt: buildFallbackFinalPrompt(input, brief),
    recommendedSize,
    warnings: ["当前使用静态降级助手，请人工确认文字和品牌元素。"]
  };
}

function summarizeMessages(input: PromptAssistantTurnInput): PromptAssistantResult["brief"] {
  const userText = input.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("；")
    .slice(0, 600);
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
    subject: userText || "用户尚未提供主体",
    style: caseStyle || (input.casePromptTemplate ? "参考所选案例模板" : "待确认"),
    scene:
      input.referenceBrief || (input.caseCategory ? `适合${input.caseCategory}场景` : "待确认"),
    composition: input.caseRecommendedSize
      ? `遵循案例推荐画幅 ${input.caseRecommendedSize}，保持主体清晰、层次明确`
      : "保持主体清晰、层次明确",
    constraints: ["无水印", "无无关 Logo", "无额外乱码文字"]
  };
}

function nextQuestion(input: PromptAssistantTurnInput) {
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

function buildFallbackFinalPrompt(
  input: PromptAssistantTurnInput,
  brief: PromptAssistantResult["brief"]
) {
  const base =
    input.mode === "image2image" ? "基于参考图进行图像编辑。" : "生成一张高质量 GPT-Image 2 图片。";
  return [
    base,
    `用途：${brief.useCase ?? "图片创作"}。`,
    `主体：${brief.subject ?? "清晰主体"}。`,
    `场景：${brief.scene ?? "干净、有层次的背景"}。`,
    `构图：${brief.composition ?? "主体突出，画面有留白和纵深"}。`,
    `风格与光线：${brief.style ?? "专业、统一、细节真实"}，光线自然，色彩协调。`,
    "文字：如用户未明确要求，则画面内不出现文字。",
    `约束：${(brief.constraints ?? []).join("、")}。`
  ].join("\n");
}
