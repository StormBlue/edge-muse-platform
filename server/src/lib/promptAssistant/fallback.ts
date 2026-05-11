import type { PromptAssistantResult, PromptAssistantTurnInput } from "./schema";
import { firstNonEmptyString } from "./parse";

export function fallbackAssistantResult(
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

export function recommendedSizeForTurn(
  input: PromptAssistantTurnInput,
  aiRecommendedSize?: string
) {
  return (
    firstNonEmptyString(
      aiRecommendedSize,
      input.caseRecommendedSize,
      input.provider?.supportedSizes?.[0]
    ) ?? "1024x1024"
  );
}

export function nextQuestion(input: PromptAssistantTurnInput) {
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

export function shouldEncourageFinalPrompt(input: PromptAssistantTurnInput) {
  if (input.forceFinalize) return true;
  if (hasUserDelegatedCreativeControl(input)) return true;
  if (input.turnIndex >= 5 || input.messages.length >= 6) return true;
  const userMessages = input.messages.filter((message) => message.role === "user");
  return Boolean(input.casePromptTemplate && userMessages.length >= 2);
}

export function shouldFallbackFinalize(input: PromptAssistantTurnInput) {
  if (input.forceFinalize) return true;
  if (hasUserDelegatedCreativeControl(input)) return true;
  if (input.turnIndex >= 5 || input.messages.length >= 10) return true;
  return false;
}

export function hasUserDelegatedCreativeControl(input: PromptAssistantTurnInput) {
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

export function lastUserMessage(input: PromptAssistantTurnInput) {
  return (
    [...input.messages]
      .reverse()
      .find((message) => message.role === "user")
      ?.content.trim() ?? ""
  );
}

export function meaningfulUserMessages(input: PromptAssistantTurnInput) {
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

export function buildFallbackFinalPrompt(
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
